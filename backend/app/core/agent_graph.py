from typing import TypedDict, List, Dict, Optional, AsyncGenerator
from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session

from app.services.llm_gateway import LLMGateway
from app.services.vector_store import VectorStoreService
from app.core.prompt_builder import build_system_prompt, format_messages_with_history
from app.models.models import Agent, Correction, ChatLog, ConversationSession
from app.config import settings
from app.tools.builtin_agent_tools import (
    create_pdf,
    generate_agent_image,
    get_active_builtin_tool_types,
    wants_image_generation,
    wants_pdf_generation,
    wants_web_search,
)

DEFAULT_OLLAMA_AGENT_MODEL = "gemma4:latest"
OPENAI_ONLY_MODELS = {"gpt-4", "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"}


class AgentState(TypedDict):
    """State object passed between nodes in the graph"""
    query: str
    conversation_history: List[Dict]   # NEW: past messages in this session
    retrieved_docs: List[Dict]
    few_shot_examples: List[Dict]
    system_prompt: str
    final_response: str
    sources: List[Dict]
    tool_results: List[Dict]


class AgentExecutor:
    """
    LangGraph-based agent executor with RAG, few-shot learning,
    conversation memory, and streaming support.
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
        self.model_override = model_override # <-- RESTORED: Needed for A/B Testing

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
        # <-- RESTORED: This targets the A/B Testing model override
        target_model = self.model_override if self.model_override else self.agent.llm_model
        if self.agent.llm_provider == "ollama" and (
            not target_model or target_model in OPENAI_ONLY_MODELS or target_model.startswith("gpt-")
        ):
            target_model = DEFAULT_OLLAMA_AGENT_MODEL
        
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
        workflow.add_node("load_history", self.load_history)         
        workflow.add_node("retrieve_knowledge", self.retrieve_knowledge)
        workflow.add_node("load_corrections", self.load_corrections)
        workflow.add_node("generate_response", self.generate_response)

        # Define edges
        workflow.set_entry_point("load_history")                     
        workflow.add_edge("load_history", "retrieve_knowledge")
        workflow.add_edge("retrieve_knowledge", "load_corrections")
        workflow.add_edge("load_corrections", "generate_response")
        workflow.add_edge("generate_response", END)

        return workflow.compile()

    # ─────────────────────────────────────────
    # GRAPH NODES (Original Async Logic Kept)
    # ─────────────────────────────────────────

    async def load_history(self, state: AgentState) -> AgentState:
        """Node 0: Load conversation history for memory"""
        if not self.agent.memory_enabled or not self.session_id:
            state["conversation_history"] = []
            self._current_conversation_history = []
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

            past_messages = list(reversed(past_messages))

            history = []
            for msg in past_messages:
                history.append({"role": "user", "content": msg.user_message})
                history.append({"role": "assistant", "content": msg.agent_response})

            state["conversation_history"] = history
            self._current_conversation_history = history
        except Exception as e:
            print(f"Error loading history: {str(e)}")
            state["conversation_history"] = []
            self._current_conversation_history = []

        return state

    async def retrieve_knowledge(self, state: AgentState) -> AgentState:
        """Node 1: Retrieve relevant documents from vector store"""
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

        try:
            active_tools = get_active_builtin_tool_types(self.db, str(self.agent_id))
            if "web_search" in active_tools and wants_web_search(state["query"]):
                from app.tools.web_search import WebSearchTool
                tool = WebSearchTool(provider="duckduckgo")
                # Need to use await inside this async method
                results = await tool.search(state["query"], max_results=3)
                if results:
                    for r in results:
                        state["retrieved_docs"].append({
                            "text": f"WEB SEARCH RESULT: {r['title']} - {r['snippet']}",
                            "metadata": {"source_file": r["url"]}
                        })
                        state["sources"].append({
                            "text": f"Web: {r['title']}",
                            "source": r["url"]
                        })
        except Exception as e:
            print(f"Web search tool error: {str(e)}")

        return state

    async def load_corrections(self, state: AgentState) -> AgentState:
        """Node 2: Load active corrections as few-shot examples"""
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
        """Node 3: Generate final response using LLM with memory (Non-streaming)"""
        try:
            active_tools = get_active_builtin_tool_types(self.db, self.agent_id)
            if "ai_image_generation" in active_tools and wants_image_generation(state["query"], state["conversation_history"]):
                tool_response = await self._maybe_run_builtin_tool(state["query"])
                if tool_response:
                    state["tool_results"] = [tool_response["source"]]
                    state["sources"].append(tool_response["source"])
                    state["final_response"] = tool_response["response"]
                    return state

            system_prompt = build_system_prompt(
                base_prompt=self.agent.system_prompt or "",
                custom_instructions="",
                retrieved_docs=state["retrieved_docs"],
                few_shot_examples=state["few_shot_examples"],
            )

            messages = format_messages_with_history(
                system_prompt=system_prompt,
                conversation_history=state["conversation_history"],
                user_message=state["query"],
            )

            response = await self.llm_gateway.generate(messages)

            tool_response = await self._maybe_run_builtin_tool(state["query"], response)
            if tool_response:
                state["tool_results"] = [tool_response["source"]]
                state["sources"].append(tool_response["source"])
                state["final_response"] = tool_response["response"]
                return state

            state["final_response"] = response

        except Exception as e:
            state["final_response"] = f"Error generating response: {str(e)}"

        return state

    # ─────────────────────────────────────────
    # NEW: STREAMING LOGIC
    # ─────────────────────────────────────────

    async def generate_response_streaming(self, state: AgentState) -> AsyncGenerator[Dict, None]:
        """Generate response using LLM with streaming"""
        active_tools = get_active_builtin_tool_types(self.db, self.agent_id)
        if "ai_image_generation" in active_tools and wants_image_generation(state["query"], state["conversation_history"]):
            tool_response = await self._maybe_run_builtin_tool(state["query"])
            if tool_response:
                state["sources"].append(tool_response["source"])
                yield {"type": "token", "content": tool_response["response"]}
                yield {"type": "sources", "content": state["sources"]}
                return

        system_prompt = build_system_prompt(
            base_prompt=self.agent.system_prompt or "",
            custom_instructions="",
            retrieved_docs=state["retrieved_docs"],
            few_shot_examples=state["few_shot_examples"],
        )

        messages = format_messages_with_history(
            system_prompt=system_prompt,
            conversation_history=state["conversation_history"],
            user_message=state["query"],
        )

        generated_response = ""
        async for token in self.llm_gateway.generate_streaming(messages):
            generated_response += token
            yield {"type": "token", "content": token}

        tool_response = await self._maybe_run_builtin_tool(state["query"], generated_response)
        if tool_response:
            state["sources"].append(tool_response["source"])
            yield {"type": "token", "content": "\n\n" + tool_response["response"]}

        # Send sources after response completes
        yield {"type": "sources", "content": state["sources"]}

    async def _maybe_run_builtin_tool(self, query: str, generated_text: str = "") -> Optional[Dict]:
        active_tools = get_active_builtin_tool_types(self.db, self.agent_id)

        if "ai_image_generation" in active_tools and wants_image_generation(query, getattr(self, "_current_conversation_history", [])):
            result = await generate_agent_image(self.db, self.agent, query)
            image_urls = result.get("image_urls") or []
            if not image_urls:
                return {
                    "response": "I tried to generate the image, but the image service did not return an image URL.",
                    "source": {"source": "AI Image Generator", "text": "No image URL returned."},
                }
            image_previews = "\n\n".join(f"![Generated image]({url})" for url in image_urls)
            links = "\n".join(f"- [Open full-size image]({url})" for url in image_urls)
            return {
                "response": f"I generated the image for you.\n\n{image_previews}\n\n{links}",
                "source": {
                    "source": "AI Image Generator",
                    "text": f"Generated {len(image_urls)} image(s).",
                    "image_urls": image_urls,
                    "generation_id": result.get("generation_id"),
                },
            }

        if "pdf_generator" in active_tools and wants_pdf_generation(query):
            content = generated_text.strip() or query.strip()
            title = query.strip()[:80] or "Generated PDF"
            result = create_pdf(title=title, content=content)
            file_url = f"{settings.PUBLIC_API_BASE_URL.rstrip('/')}{result['url']}"
            return {
                "response": f"I created the PDF for you.\n\n[Download PDF]({file_url})",
                "source": {
                    "source": "PDF Generator",
                    "text": "Created a downloadable PDF from the response content.",
                },
            }

        return None

    async def run_streaming(self, query: str) -> AsyncGenerator[Dict, None]:
        """Execute agent graph manually with streaming response"""
        state: AgentState = {
            "query": query,
            "conversation_history": [],
            "retrieved_docs": [],
            "few_shot_examples": [],
            "system_prompt": "",
            "final_response": "",
            "sources": [],
            "tool_results": [],
        }

        # Run retrieval nodes sequentially (they are async)
        state = await self.load_history(state)
        self._current_conversation_history = state["conversation_history"]
        state = await self.retrieve_knowledge(state)
        state = await self.load_corrections(state)

        # Stream the LLM response
        async for chunk in self.generate_response_streaming(state):
            yield chunk

    # ─────────────────────────────────────────
    # EXECUTION
    # ─────────────────────────────────────────

    async def run(self, query: str) -> Dict:
        """Execute the agent graph (Non-streaming)"""
        initial_state: AgentState = {
            "query": query,
            "conversation_history": [],
            "retrieved_docs": [],
            "few_shot_examples": [],
            "system_prompt": "",
            "final_response": "",
            "sources": [],
            "tool_results": [],
        }

        result = await self.graph.ainvoke(initial_state)

        return {
            "response": result["final_response"],
            "sources": result["sources"],
        }
