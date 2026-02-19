from typing import TypedDict, List, Dict, Optional
from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session

from app.services.llm_gateway import LLMGateway
from app.services.vector_store import VectorStoreService
from app.core.prompt_builder import build_system_prompt, format_messages_with_history
from app.models.models import Agent, Correction, ChatLog, ConversationSession


class AgentState(TypedDict):
    """State object passed between nodes in the graph"""
    query: str
    conversation_history: List[Dict]   # NEW: past messages in this session
    retrieved_docs: List[Dict]
    few_shot_examples: List[Dict]
    system_prompt: str
    final_response: str
    sources: List[Dict]


class AgentExecutor:
    """
    LangGraph-based agent executor with RAG, few-shot learning,
    and conversation memory.
    """

    def __init__(
        self,
        agent_id: str,
        db: Session,
        vector_store: VectorStoreService,
        session_id: Optional[str] = None,
        model_override: Optional[str] = None,
    ):
        self.agent_id = agent_id
        self.db = db
        self.vector_store = vector_store
        self.session_id = session_id      
        self.model_override = model_override

        # Load agent configuration
        self.agent = self._load_agent()
        self.llm_gateway = self._initialize_llm()

        # Build the graph
        self.graph = self._build_graph()

    def _load_agent(self) -> Agent:
        """Load agent from database"""
        agent = self.db.query(Agent).filter(Agent.id == self.agent_id).first()
        if not agent:
            raise ValueError(f"Agent {self.agent_id} not found")
        return agent

    def _initialize_llm(self) -> LLMGateway:
        """Initialize LLM gateway based on agent configuration"""
        target_model = self.model_override if self.model_override else self.agent.llm_model
        
        return LLMGateway(
            provider=self.agent.llm_provider,
            model=target_model, 
            api_key=self.agent.api_key,
            endpoint=self.agent.ollama_endpoint,
            temperature=self.agent.temperature,
        )

    def _build_graph(self) -> StateGraph:
        """Build the LangGraph state machine"""
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("load_history", self.load_history)         # NEW first node
        workflow.add_node("retrieve_knowledge", self.retrieve_knowledge)
        workflow.add_node("load_corrections", self.load_corrections)
        workflow.add_node("generate_response", self.generate_response)

        # Define edges
        workflow.set_entry_point("load_history")                     # NEW entry point
        workflow.add_edge("load_history", "retrieve_knowledge")
        workflow.add_edge("retrieve_knowledge", "load_corrections")
        workflow.add_edge("load_corrections", "generate_response")
        workflow.add_edge("generate_response", END)

        return workflow.compile()

    async def load_history(self, state: AgentState) -> AgentState:
        """
        NEW Node 0: Load conversation history for memory
        Fetches the last N messages from the current session
        """
        # If memory is disabled or no session, skip
        if not self.agent.memory_enabled or not self.session_id:
            state["conversation_history"] = []
            return state

        try:
            window = self.agent.memory_window or 10

            past_messages = (
                self.db.query(ChatLog)
                .filter(ChatLog.session_id == self.session_id)
                .order_by(ChatLog.created_at.desc())
                .limit(window)
                .all()
            )

            # Reverse so oldest is first (chronological order for LLM)
            past_messages = list(reversed(past_messages))

            history = []
            for msg in past_messages:
                history.append({"role": "user", "content": msg.user_message})
                history.append({"role": "assistant", "content": msg.agent_response})

            state["conversation_history"] = history
            print(f"🧠 Loaded {len(past_messages)} past messages from session {self.session_id}")

        except Exception as e:
            print(f"Error loading history: {str(e)}")
            state["conversation_history"] = []

        return state

    async def retrieve_knowledge(self, state: AgentState) -> AgentState:
        """
        Node 1: Retrieve relevant documents from vector store
        """
        try:
            docs = await self.vector_store.similarity_search(
                agent_id=str(self.agent_id), query=state["query"], k=4
            )
            state["retrieved_docs"] = docs
            state["sources"] = [
                {
                    "text": doc["text"][:200] + "...",
                    "source": doc.get("metadata", {}).get("source_file", "Unknown"),
                }
                for doc in docs
            ]
        except Exception as e:
            print(f"Error retrieving knowledge: {str(e)}")
            state["retrieved_docs"] = []
            state["sources"] = []

        return state

    async def load_corrections(self, state: AgentState) -> AgentState:
        """
        Node 2: Load active corrections as few-shot examples
        """
        try:
            corrections = (
                self.db.query(Correction)
                .filter(
                    Correction.agent_id == self.agent_id,
                    Correction.is_active == True,
                )
                .order_by(Correction.created_at.desc())
                .limit(5)
                .all()
            )

            state["few_shot_examples"] = [
                {
                    "user_query": c.user_query,
                    "incorrect_response": c.incorrect_response,
                    "corrected_response": c.corrected_response,
                }
                for c in corrections
            ]
        except Exception as e:
            print(f"Error loading corrections: {str(e)}")
            state["few_shot_examples"] = []

        return state

    async def generate_response(self, state: AgentState) -> AgentState:
        """
        Node 3: Generate final response using LLM with memory
        """
        try:
            # Build system prompt with RAG + few-shot
            system_prompt = build_system_prompt(
                base_prompt=self.agent.system_prompt or "",
                custom_instructions="",
                retrieved_docs=state["retrieved_docs"],
                few_shot_examples=state["few_shot_examples"],
            )

            # Format messages WITH conversation history
            messages = format_messages_with_history(
                system_prompt=system_prompt,
                conversation_history=state["conversation_history"],
                user_message=state["query"],
            )

            # Generate response
            response = await self.llm_gateway.generate(messages)
            state["final_response"] = response

        except Exception as e:
            state["final_response"] = f"Error generating response: {str(e)}"

        return state

    async def run(self, query: str) -> Dict:
        """
        Execute the agent graph

        Args:
            query: User's question

        Returns:
            Dict with response and sources
        """
        initial_state: AgentState = {
            "query": query,
            "conversation_history": [],   # NEW
            "retrieved_docs": [],
            "few_shot_examples": [],
            "system_prompt": "",
            "final_response": "",
            "sources": [],
        }

        result = await self.graph.ainvoke(initial_state)

        return {
            "response": result["final_response"],
            "sources": result["sources"],
        }
