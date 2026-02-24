"""
Web Search Tool Integration

Supports multiple search providers:
- Tavily API (recommended, built for AI)
- DuckDuckGo (free, no API key needed)
- Google Custom Search (optional)
"""

from typing import List, Dict, Optional
import os
import httpx
from datetime import datetime


class WebSearchTool:
    """Web search tool for agents"""
    
    def __init__(self, provider: str = "duckduckgo", api_key: Optional[str] = None):
        """
        Initialize web search tool
        
        Args:
            provider: 'tavily', 'duckduckgo', or 'google'
            api_key: API key for Tavily or Google (not needed for DuckDuckGo)
        """
        self.provider = provider.lower()
        self.api_key = api_key or os.getenv("TAVILY_API_KEY")
        
    async def search(self, query: str, max_results: int = 5) -> List[Dict]:
        """
        Search the web and return results
        
        Returns:
            List of dicts with: {title, url, snippet, published_date}
        """
        if self.provider == "tavily":
            return await self._search_tavily(query, max_results)
        elif self.provider == "duckduckgo":
            return await self._search_duckduckgo(query, max_results)
        else:
            raise ValueError(f"Unknown provider: {self.provider}")
    
    async def _search_tavily(self, query: str, max_results: int) -> List[Dict]:
        """Search using Tavily API (best for AI agents)"""
        if not self.api_key:
            raise ValueError("Tavily API key required. Set TAVILY_API_KEY env var.")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": self.api_key,
                    "query": query,
                    "max_results": max_results,
                    "include_answer": True,  # Get AI-generated answer
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                raise Exception(f"Tavily API error: {response.text}")
            
            data = response.json()
            
            results = []
            for result in data.get("results", []):
                results.append({
                    "title": result.get("title", ""),
                    "url": result.get("url", ""),
                    "snippet": result.get("content", ""),
                    "published_date": result.get("published_date"),
                    "score": result.get("score", 0),
                })
            
            # Add AI answer if available
            if data.get("answer"):
                results.insert(0, {
                    "title": "AI Summary",
                    "url": "",
                    "snippet": data["answer"],
                    "published_date": None,
                    "score": 1.0,
                })
            
            return results
    
    async def _search_duckduckgo(self, query: str, max_results: int) -> List[Dict]:
        """Search using DuckDuckGo (free, no API key needed)"""
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            raise ImportError("Install duckduckgo-search: pip install duckduckgo-search")
        
        ddgs = DDGS()
        results = []
        
        try:
            search_results = ddgs.text(query, max_results=max_results)
            
            for result in search_results:
                results.append({
                    "title": result.get("title", ""),
                    "url": result.get("href", ""),
                    "snippet": result.get("body", ""),
                    "published_date": None,
                    "score": 0.5,
                })
        except Exception as e:
            print(f"DuckDuckGo search error: {e}")
        
        return results
    
    def format_results_for_llm(self, results: List[Dict]) -> str:
        """Format search results into a prompt-friendly string"""
        if not results:
            return "No search results found."
        
        formatted = "Search Results:\n\n"
        
        for i, result in enumerate(results, 1):
            formatted += f"{i}. {result['title']}\n"
            formatted += f"   URL: {result['url']}\n"
            formatted += f"   {result['snippet']}\n\n"
        
        return formatted


# Tool definition for LangChain/LangGraph
def create_web_search_tool(provider: str = "duckduckgo", api_key: Optional[str] = None):
    """
    Create a web search tool for use in LangGraph
    
    Usage:
        tool = create_web_search_tool()
        results = await tool.ainvoke({"query": "latest AI news"})
    """
    from langchain_core.tools import Tool
    
    search = WebSearchTool(provider=provider, api_key=api_key)
    
    async def search_wrapper(query: str) -> str:
        """Search the web and return formatted results"""
        results = await search.search(query, max_results=5)
        return search.format_results_for_llm(results)
    
    return Tool(
        name="web_search",
        description="""Search the web for current information. 
Use this when you need:
- Recent news or events
- Current facts or statistics
- Information not in your knowledge base
- Real-time data

Input should be a clear search query.""",
        func=search_wrapper,
        coroutine=search_wrapper,  # For async usage
    )
