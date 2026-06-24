"""
Tools Package

Provides agent tools for external integrations:
- Web search (DuckDuckGo, Tavily)
- Custom API calls (REST, GraphQL)
- Tool management and loading
"""

from .web_search import WebSearchTool, create_web_search_tool
from .custom_api import (
    CustomAPITool,
    APIToolConfig,
    create_custom_api_tool,
    SHOPIFY_ORDERS_CONFIG,
    JIRA_CREATE_ISSUE_CONFIG,
    SLACK_SEND_MESSAGE_CONFIG,
)
from .tool_manager import ToolManager, load_agent_tools

__all__ = [
    # Web Search
    "WebSearchTool",
    "create_web_search_tool",
    
    # Custom APIs
    "CustomAPITool",
    "APIToolConfig",
    "create_custom_api_tool",
    
    # Pre-configured templates
    "SHOPIFY_ORDERS_CONFIG",
    "JIRA_CREATE_ISSUE_CONFIG",
    "SLACK_SEND_MESSAGE_CONFIG",
    
    # Tool Manager
    "ToolManager",
    "load_agent_tools",
]
