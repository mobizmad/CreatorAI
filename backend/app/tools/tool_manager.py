"""
Tool Manager

Centralized system for loading and managing agent tools.
Handles tool discovery, initialization, and caching.
"""

from typing import List, Dict, Optional
from sqlalchemy.orm import Session
import logging

from app.models.models import Agent, AgentTool
from app.tools.web_search import create_web_search_tool
from app.tools.custom_api import create_custom_api_tool, APIToolConfig

logger = logging.getLogger(__name__)


class ToolManager:
    """
    Manages tool loading and caching for agents
    
    Usage:
        manager = ToolManager(db)
        tools = await manager.get_tools_for_agent(agent_id)
    """
    
    def __init__(self, db: Session):
        self.db = db
        self._cache = {}  # Cache loaded tools
    
    async def get_tools_for_agent(
        self, 
        agent_id: str,
        force_reload: bool = False
    ) -> Dict[str, List]:
        """
        Load all enabled tools for an agent
        
        Returns dict by category:
        {
            "search": [web_search_tool],
            "api": [shopify_tool, jira_tool],
            "builtin": [calculator_tool]
        }
        """
        # Check cache
        if not force_reload and agent_id in self._cache:
            return self._cache[agent_id]
        
        # Load agent
        agent = self.db.query(Agent).filter(Agent.id == agent_id).first()
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")
        
        tools = {
            "search": [],
            "api": [],
            "builtin": [],
        }
        
        # Load web search tool if enabled
        if agent.web_search_enabled:
            search_tool = self._create_search_tool(agent)
            if search_tool:
                tools["search"].append(search_tool)
                logger.info(f"Loaded web search tool for agent {agent_id}")
        
        # Load custom API tools
        custom_tools = (
            self.db.query(AgentTool)
            .filter(
                AgentTool.agent_id == agent_id,
                AgentTool.is_active == True,
                AgentTool.tool_type == "custom_api"
            )
            .all()
        )
        
        for tool_model in custom_tools:
            try:
                api_tool = self._create_custom_api_tool(tool_model)
                tools["api"].append(api_tool)
                logger.info(f"Loaded custom tool '{tool_model.name}' for agent {agent_id}")
            except Exception as e:
                logger.error(f"Failed to load tool {tool_model.name}: {e}")
        
        # Cache the tools
        self._cache[agent_id] = tools
        
        return tools
    
    def _create_search_tool(self, agent: Agent):
        """Create web search tool based on agent settings"""
        try:
            provider = agent.search_provider or "duckduckgo"
            api_key = agent.tavily_api_key if provider == "tavily" else None
            
            return create_web_search_tool(
                provider=provider,
                api_key=api_key
            )
        except Exception as e:
            logger.error(f"Failed to create search tool: {e}")
            return None
    
    def _create_custom_api_tool(self, tool_model: AgentTool):
        """Create custom API tool from database model"""
        config = APIToolConfig(
            name=tool_model.name,
            description=tool_model.description,
            url=tool_model.api_url,
            method=tool_model.method,
            headers=tool_model.headers or {},
            auth_type=tool_model.auth_type,
            auth_value=tool_model.auth_value,
            request_body_template=tool_model.request_body_template,
            response_path=tool_model.response_path,
        )
        
        return create_custom_api_tool(config)
    
    def get_all_tools_flat(self, agent_id: str) -> List:
        """Get all tools as a flat list (useful for LangChain)"""
        tools_by_category = self.get_tools_for_agent(agent_id)
        
        all_tools = []
        for category, tools in tools_by_category.items():
            all_tools.extend(tools)
        
        return all_tools
    
    def clear_cache(self, agent_id: Optional[str] = None):
        """Clear tool cache for an agent or all agents"""
        if agent_id:
            self._cache.pop(agent_id, None)
        else:
            self._cache.clear()
    
    def get_tool_by_name(self, agent_id: str, tool_name: str):
        """Get a specific tool by name"""
        tools = self.get_tools_for_agent(agent_id)
        
        for category, tool_list in tools.items():
            for tool in tool_list:
                if tool.name == tool_name:
                    return tool
        
        return None
    
    def get_tool_descriptions(self, agent_id: str) -> str:
        """
        Get formatted string of all tool descriptions
        (useful for prompts)
        """
        tools = self.get_all_tools_flat(agent_id)
        
        if not tools:
            return "No tools available."
        
        descriptions = ["Available tools:"]
        for tool in tools:
            descriptions.append(f"- {tool.name}: {tool.description}")
        
        return "\n".join(descriptions)


# Convenience function
async def load_agent_tools(agent_id: str, db: Session) -> Dict[str, List]:
    """
    Quick function to load tools for an agent
    
    Usage:
        tools = await load_agent_tools(agent_id, db)
    """
    manager = ToolManager(db)
    return await manager.get_tools_for_agent(agent_id)


# Built-in tools that don't require configuration
class BuiltInTools:
    """Collection of built-in tools available to all agents"""
    
    @staticmethod
    def calculator():
        """Simple calculator tool"""
        from langchain_core.tools import Tool
        
        def calculate(expression: str) -> str:
            """Evaluate a mathematical expression"""
            try:
                # Safe eval for math only
                import ast
                import operator
                
                operators = {
                    ast.Add: operator.add,
                    ast.Sub: operator.sub,
                    ast.Mult: operator.mul,
                    ast.Div: operator.truediv,
                    ast.Pow: operator.pow,
                }
                
                def eval_expr(node):
                    if isinstance(node, ast.Num):
                        return node.n
                    elif isinstance(node, ast.BinOp):
                        return operators[type(node.op)](
                            eval_expr(node.left),
                            eval_expr(node.right)
                        )
                    else:
                        raise TypeError(node)
                
                result = eval_expr(ast.parse(expression, mode='eval').body)
                return str(result)
            except Exception as e:
                return f"Error: {str(e)}"
        
        return Tool(
            name="calculator",
            description="Evaluate mathematical expressions. Input should be a valid math expression like '2 + 2' or '10 * 5'",
            func=calculate
        )
    
    @staticmethod
    def get_current_time():
        """Get current time tool"""
        from langchain_core.tools import Tool
        from datetime import datetime
        
        def get_time(format: str = "%Y-%m-%d %H:%M:%S") -> str:
            """Get current date and time"""
            return datetime.now().strftime(format)
        
        return Tool(
            name="get_current_time",
            description="Get the current date and time. Input should be a strftime format string (optional).",
            func=get_time
        )
    
    @staticmethod
    def all():
        """Get all built-in tools"""
        return [
            BuiltInTools.calculator(),
            BuiltInTools.get_current_time(),
        ]


# Example usage in agent_graph.py:
"""
from app.tools.tool_manager import ToolManager

class AgentExecutor:
    def __init__(self, agent_id: str, db: Session):
        self.agent_id = agent_id
        self.db = db
        
        # Load tools
        self.tool_manager = ToolManager(db)
        self.tools = await self.tool_manager.get_tools_for_agent(agent_id)
        
    async def run(self, query: str):
        # Get all tools as flat list for LangChain
        all_tools = self.tool_manager.get_all_tools_flat(self.agent_id)
        
        # Add built-in tools
        all_tools.extend(BuiltInTools.all())
        
        # Use tools in agent execution...
"""
