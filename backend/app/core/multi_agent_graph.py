"""
Multi-Agent Workflow System

Implements a Supervisor-Worker pattern:
- Supervisor: Routes user queries to specialized workers
- Workers: Researcher, Writer, API Specialist, Analyst

Each worker has specific tools and responsibilities.
"""

from typing import TypedDict, List, Dict, Annotated, Literal
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from sqlalchemy.orm import Session
import json

from app.services.llm_gateway import LLMGateway
from app.services.vector_store import VectorStoreService
from app.tools.web_search import create_web_search_tool
from app.tools.custom_api import create_custom_api_tool, APIToolConfig
from app.models.models import Agent, AgentTool


class MultiAgentState(TypedDict):
    """State shared across all agents"""
    query: str
    conversation_history: List[Dict]
    current_agent: str
    messages: List[Dict]
    final_response: str
    sources: List[Dict]
    routing_decision: str
    worker_outputs: Dict[str, str]


class SupervisorAgent:
    """Routes queries to appropriate worker agents"""
    
    def __init__(self, llm: LLMGateway, available_workers: List[str]):
        self.llm = llm
        self.available_workers = available_workers
        
    def route(self, state: MultiAgentState) -> str:
        """
        Decide which worker should handle the query
        
        Returns: worker name or "END"
        """
        query = state["query"]
        worker_outputs = state.get("worker_outputs", {})
        
        # If all workers have contributed, finish
        if len(worker_outputs) >= len(self.available_workers):
            return "END"
        
        # Build routing prompt
        routing_prompt = f"""You are a supervisor routing user queries to specialized workers.

Available workers:
- researcher: Has web search. Use for: current events, fact-finding, recent information
- writer: Formats responses. Use for: creating structured output, polishing text
- api_specialist: Calls external APIs. Use for: Shopify orders, Jira tickets, Slack messages
- analyst: Processes data. Use for: calculations, data analysis, comparisons

User query: "{query}"

Already completed: {list(worker_outputs.keys())}
Still available: {[w for w in self.available_workers if w not in worker_outputs]}

Which worker should handle this next? Respond with ONLY the worker name, or "FINISH" if done.
"""
        
        messages = [{"role": "user", "content": routing_prompt}]
        decision = self.llm.generate(messages).strip().lower()
        
        # Map decision to worker or END
        if decision == "finish" or decision not in self.available_workers:
            return "END"
        
        return decision


class WorkerAgent:
    """Base class for specialized worker agents"""
    
    def __init__(
        self,
        name: str,
        role: str,
        llm: LLMGateway,
        tools: List = None,
        vector_store: VectorStoreService = None,
    ):
        self.name = name
        self.role = role
        self.llm = llm
        self.tools = tools or []
        self.vector_store = vector_store
    
    async def execute(self, state: MultiAgentState) -> Dict[str, str]:
        """
        Execute worker's task
        
        Returns: {"output": "worker's response"}
        """
        query = state["query"]
        previous_outputs = state.get("worker_outputs", {})
        
        # Build context from previous workers
        context = ""
        if previous_outputs:
            context = "Previous workers' outputs:\n"
            for worker, output in previous_outputs.items():
                context += f"{worker}: {output}\n\n"
        
        # Build worker prompt
        system_prompt = f"""You are a {self.role}.

{context}

User query: "{query}"

Your task: {self._get_task_description()}
"""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]
        
        # Use tools if available
        if self.tools:
            # Tool calling logic here
            response = await self._execute_with_tools(messages)
        else:
            response = self.llm.generate(messages)
        
        return {"output": response}
    
    def _get_task_description(self) -> str:
        """Override in subclasses"""
        return "Complete your specialized task."
    
    async def _execute_with_tools(self, messages: List[Dict]) -> str:
        """Execute with tool calling"""
        # Build tool-aware prompt
        tool_descriptions = "\n".join([
            f"- {tool.name}: {tool.description}"
            for tool in self.tools
        ])
        
        messages[0]["content"] += f"\n\nAvailable tools:\n{tool_descriptions}"
        
        # Get LLM response (may include tool calls)
        response = self.llm.generate(messages)
        
        # Check if LLM wants to use a tool
        # (In production, use function calling API)
        if "USE_TOOL:" in response:
            tool_name = response.split("USE_TOOL:")[1].split("\n")[0].strip()
            tool_input = response.split("INPUT:")[1].strip() if "INPUT:" in response else ""
            
            # Find and execute tool
            for tool in self.tools:
                if tool.name == tool_name:
                    try:
                        result = await tool.ainvoke(tool_input)
                        return f"Tool result: {result}\n\nBased on this, here's my answer:\n{response}"
                    except Exception as e:
                        return f"Tool error: {e}\n\nFallback response: {response}"
        
        return response


class ResearcherAgent(WorkerAgent):
    """Searches the web and retrieves information"""
    
    def _get_task_description(self) -> str:
        return """Search the web for current, factual information to answer the query.
Provide sources and be specific."""


class WriterAgent(WorkerAgent):
    """Formats and polishes responses"""
    
    def _get_task_description(self) -> str:
        return """Take information from other workers and format it into a clear,
well-structured response. Use markdown formatting."""


class APISpecialistAgent(WorkerAgent):
    """Calls external APIs"""
    
    def _get_task_description(self) -> str:
        return """Use available API tools to fetch or modify data in external systems.
Report results clearly."""


class AnalystAgent(WorkerAgent):
    """Processes and analyzes data"""
    
    def _get_task_description(self) -> str:
        return """Analyze data, perform calculations, make comparisons.
Show your work and explain conclusions."""


class MultiAgentExecutor:
    """Orchestrates multi-agent workflows"""
    
    def __init__(
        self,
        agent_id: str,
        db: Session,
        vector_store: VectorStoreService,
    ):
        self.agent_id = agent_id
        self.db = db
        self.vector_store = vector_store
        
        # Load agent config
        self.agent = db.query(Agent).filter(Agent.id == agent_id).first()
        if not self.agent:
            raise ValueError(f"Agent {agent_id} not found")
        
        self.llm = LLMGateway(
            provider=self.agent.llm_provider,
            model=self.agent.llm_model,
            temperature=self.agent.temperature,
            api_key=self.agent.api_key,
        )
        
        # Load enabled tools
        self.tools = self._load_tools()
        
        # Create worker agents
        self.workers = self._create_workers()
        
        # Create supervisor
        self.supervisor = SupervisorAgent(
            llm=self.llm,
            available_workers=list(self.workers.keys())
        )
        
        # Build graph
        self.graph = self._build_graph()
    
    def _load_tools(self) -> Dict[str, List]:
        """Load tools enabled for this agent"""
        tools_by_worker = {
            "researcher": [],
            "writer": [],
            "api_specialist": [],
            "analyst": [],
        }
        
        # Check if web search is enabled
        if self.agent.web_search_enabled:
            search_tool = create_web_search_tool(
                provider=self.agent.search_provider or "duckduckgo"
            )
            tools_by_worker["researcher"].append(search_tool)
        
        # Load custom API tools
        custom_tools = (
            self.db.query(AgentTool)
            .filter(
                AgentTool.agent_id == self.agent_id,
                AgentTool.is_active == True
            )
            .all()
        )
        
        for tool_config in custom_tools:
            config = APIToolConfig(
                name=tool_config.name,
                description=tool_config.description,
                url=tool_config.api_url,
                method=tool_config.method,
                headers=tool_config.headers or {},
                auth_type=tool_config.auth_type,
                auth_value=tool_config.auth_value,
            )
            
            api_tool = create_custom_api_tool(config)
            tools_by_worker["api_specialist"].append(api_tool)
        
        return tools_by_worker
    
    def _create_workers(self) -> Dict[str, WorkerAgent]:
        """Create worker agents"""
        workers = {}
        
        workers["researcher"] = ResearcherAgent(
            name="researcher",
            role="Research Specialist with web access",
            llm=self.llm,
            tools=self.tools["researcher"],
            vector_store=self.vector_store,
        )
        
        workers["writer"] = WriterAgent(
            name="writer",
            role="Content Writer and Formatter",
            llm=self.llm,
        )
        
        if self.tools["api_specialist"]:
            workers["api_specialist"] = APISpecialistAgent(
                name="api_specialist",
                role="API Integration Specialist",
                llm=self.llm,
                tools=self.tools["api_specialist"],
            )
        
        workers["analyst"] = AnalystAgent(
            name="analyst",
            role="Data Analyst",
            llm=self.llm,
        )
        
        return workers
    
    def _build_graph(self) -> StateGraph:
        """Build LangGraph multi-agent workflow"""
        workflow = StateGraph(MultiAgentState)
        
        # Add supervisor node
        workflow.add_node("supervisor", self._supervisor_node)
        
        # Add worker nodes
        for worker_name, worker in self.workers.items():
            workflow.add_node(worker_name, self._create_worker_node(worker))
        
        # Add writer as final step
        workflow.add_node("finalize", self._finalize_node)
        
        # Set entry point
        workflow.set_entry_point("supervisor")
        
        # Conditional routing from supervisor
        workflow.add_conditional_edges(
            "supervisor",
            self._route_to_worker,
            {worker: worker for worker in self.workers.keys()} | {"END": "finalize"}
        )
        
        # Workers route back to supervisor
        for worker_name in self.workers.keys():
            workflow.add_edge(worker_name, "supervisor")
        
        # Finalize ends the workflow
        workflow.add_edge("finalize", END)
        
        return workflow.compile()
    
    def _supervisor_node(self, state: MultiAgentState) -> MultiAgentState:
        """Supervisor decides next worker"""
        decision = self.supervisor.route(state)
        state["routing_decision"] = decision
        return state
    
    def _route_to_worker(self, state: MultiAgentState) -> str:
        """Route based on supervisor's decision"""
        return state.get("routing_decision", "END")
    
    def _create_worker_node(self, worker: WorkerAgent):
        """Create a worker node function"""
        async def worker_node(state: MultiAgentState) -> MultiAgentState:
            result = await worker.execute(state)
            
            if "worker_outputs" not in state:
                state["worker_outputs"] = {}
            
            state["worker_outputs"][worker.name] = result["output"]
            return state
        
        return worker_node
    
    async def _finalize_node(self, state: MultiAgentState) -> MultiAgentState:
        """Combine all worker outputs into final response"""
        worker_outputs = state.get("worker_outputs", {})
        
        # Let writer create final response
        if "writer" in worker_outputs:
            state["final_response"] = worker_outputs["writer"]
        else:
            # Combine outputs if writer wasn't used
            combined = "\n\n".join([
                f"**{worker.title()}:**\n{output}"
                for worker, output in worker_outputs.items()
            ])
            state["final_response"] = combined
        
        return state
    
    async def run(self, query: str) -> Dict:
        """Execute multi-agent workflow"""
        initial_state = {
            "query": query,
            "conversation_history": [],
            "current_agent": "supervisor",
            "messages": [],
            "final_response": "",
            "sources": [],
            "routing_decision": "",
            "worker_outputs": {},
        }
        
        result = await self.graph.ainvoke(initial_state)
        
        return {
            "response": result["final_response"],
            "sources": result.get("sources", []),
            "workers_used": list(result.get("worker_outputs", {}).keys()),
        }
