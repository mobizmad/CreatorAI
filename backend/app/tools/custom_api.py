"""
Custom API Tool System

Allows users to connect their own APIs as tools for agents.
Supports: REST APIs, GraphQL, and authenticated endpoints.
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel
import httpx
import json


class APIToolConfig(BaseModel):
    """Configuration for a custom API tool"""
    name: str
    description: str
    url: str
    method: str = "GET"  # GET, POST, PUT, DELETE
    headers: Dict[str, str] = {}
    auth_type: Optional[str] = None  # 'bearer', 'api_key', 'basic', None
    auth_value: Optional[str] = None
    request_body_template: Optional[Dict] = None
    response_path: Optional[str] = None  # JSONPath to extract data


class CustomAPITool:
    """Execute calls to user-defined APIs"""
    
    def __init__(self, config: APIToolConfig):
        self.config = config
        
    async def call(self, parameters: Dict[str, Any]) -> str:
        """
        Make an API call with the given parameters
        
        Args:
            parameters: Variables to inject into URL/body template
            
        Returns:
            Formatted response string
        """
        # Build headers
        headers = self.config.headers.copy()
        
        # Add authentication
        if self.config.auth_type == "bearer":
            headers["Authorization"] = f"Bearer {self.config.auth_value}"
        elif self.config.auth_type == "api_key":
            headers["X-API-Key"] = self.config.auth_value
        elif self.config.auth_type == "basic":
            # Assuming auth_value is "username:password"
            import base64
            encoded = base64.b64encode(self.config.auth_value.encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"
        
        # Inject parameters into URL
        url = self.config.url.format(**parameters)
        
        # Build request body if needed
        body = None
        if self.config.request_body_template and self.config.method in ["POST", "PUT"]:
            body = self._inject_parameters(self.config.request_body_template, parameters)
        
        # Make request
        async with httpx.AsyncClient() as client:
            try:
                response = await client.request(
                    method=self.config.method,
                    url=url,
                    headers=headers,
                    json=body,
                    timeout=30.0
                )
                
                response.raise_for_status()
                
                # Parse response
                if response.headers.get("content-type", "").startswith("application/json"):
                    data = response.json()
                    
                    # Extract specific path if specified
                    if self.config.response_path:
                        data = self._extract_json_path(data, self.config.response_path)
                    
                    return json.dumps(data, indent=2)
                else:
                    return response.text
                    
            except httpx.HTTPError as e:
                return f"API Error: {str(e)}"
    
    def _inject_parameters(self, template: Dict, parameters: Dict) -> Dict:
        """Recursively inject parameters into template"""
        result = {}
        for key, value in template.items():
            if isinstance(value, str) and value.startswith("{") and value.endswith("}"):
                param_name = value[1:-1]
                result[key] = parameters.get(param_name, value)
            elif isinstance(value, dict):
                result[key] = self._inject_parameters(value, parameters)
            else:
                result[key] = value
        return result
    
    def _extract_json_path(self, data: Any, path: str) -> Any:
        """Extract data using simple JSONPath (e.g., 'data.items[0].name')"""
        keys = path.split(".")
        current = data
        
        for key in keys:
            # Handle array indexing: items[0]
            if "[" in key and "]" in key:
                name, idx = key[:-1].split("[")
                current = current[name][int(idx)]
            else:
                current = current[key]
        
        return current


def create_custom_api_tool(config: APIToolConfig):
    """
    Create a LangChain tool from API configuration
    
    Usage:
        config = APIToolConfig(
            name="get_weather",
            description="Get current weather for a city",
            url="https://api.weather.com/v1/current?city={city}",
            method="GET",
            headers={"Accept": "application/json"},
            auth_type="api_key",
            auth_value="your-api-key"
        )
        
        tool = create_custom_api_tool(config)
        result = await tool.ainvoke({"city": "San Francisco"})
    """
    from langchain_core.tools import Tool
    
    api_tool = CustomAPITool(config)
    
    async def api_wrapper(**kwargs) -> str:
        """Call the custom API with parameters"""
        return await api_tool.call(kwargs)
    
    return Tool(
        name=config.name,
        description=config.description,
        func=api_wrapper,
        coroutine=api_wrapper,
    )


# Example configurations for common APIs

SHOPIFY_ORDERS_CONFIG = APIToolConfig(
    name="shopify_get_orders",
    description="Get recent orders from Shopify store",
    url="https://{shop_name}.myshopify.com/admin/api/2024-01/orders.json",
    method="GET",
    auth_type="api_key",
    auth_value="{shopify_api_key}",  # User provides this
    response_path="orders",
)

JIRA_CREATE_ISSUE_CONFIG = APIToolConfig(
    name="jira_create_issue",
    description="Create a new Jira issue",
    url="https://{jira_domain}.atlassian.net/rest/api/3/issue",
    method="POST",
    headers={"Content-Type": "application/json"},
    auth_type="basic",
    auth_value="{email}:{api_token}",  # User provides this
    request_body_template={
        "fields": {
            "project": {"key": "{project_key}"},
            "summary": "{summary}",
            "description": "{description}",
            "issuetype": {"name": "Task"}
        }
    },
    response_path="key",
)

SLACK_SEND_MESSAGE_CONFIG = APIToolConfig(
    name="slack_send_message",
    description="Send a message to a Slack channel",
    url="https://slack.com/api/chat.postMessage",
    method="POST",
    headers={"Content-Type": "application/json"},
    auth_type="bearer",
    auth_value="{slack_bot_token}",  # User provides this
    request_body_template={
        "channel": "{channel_id}",
        "text": "{message}"
    },
)
