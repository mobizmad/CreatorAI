from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.db.database import get_db
from app.models.models import User, Agent, AgentTool
from app.schemas.schemas import ToolCreate, ToolResponse, ToolTest
from app.api.auth import get_current_user
from app.tools.custom_api import CustomAPITool, APIToolConfig

router = APIRouter(prefix="/agents/{agent_id}/tools", tags=["Tools"])


def verify_agent_access(agent_id: UUID, user_id: UUID, db: Session) -> Agent:
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.user_id == user_id
    ).first()
    
    if not agent:
        raise HTTPException(404, "Agent not found")
    
    return agent


@router.post("", response_model=ToolResponse, status_code=201)
async def create_tool(
    agent_id: UUID,
    tool: ToolCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new custom API tool"""
    verify_agent_access(agent_id, current_user.id, db)
    
    # Check for duplicate name
    existing = db.query(AgentTool).filter(
        AgentTool.agent_id == agent_id,
        AgentTool.name == tool.name
    ).first()
    
    if existing:
        raise HTTPException(400, "Tool with this name already exists")
    
    agent_tool = AgentTool(
        agent_id=agent_id,
        name=tool.name,
        description=tool.description,
        tool_type=tool.tool_type,
        api_url=tool.api_url,
        method=tool.method,
        headers=tool.headers,
        auth_type=tool.auth_type,
        auth_value=tool.auth_value,  # TODO: Encrypt this
        request_body_template=tool.request_body_template,
        response_path=tool.response_path,
    )
    
    db.add(agent_tool)
    db.commit()
    db.refresh(agent_tool)
    
    return agent_tool


@router.get("", response_model=List[ToolResponse])
async def list_tools(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all tools for an agent"""
    verify_agent_access(agent_id, current_user.id, db)
    
    tools = db.query(AgentTool).filter(
        AgentTool.agent_id == agent_id
    ).all()
    
    return tools


@router.post("/{tool_id}/test")
async def test_tool(
    agent_id: UUID,
    tool_id: UUID,
    test_data: ToolTest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test a tool with sample parameters"""
    verify_agent_access(agent_id, current_user.id, db)
    
    tool = db.query(AgentTool).filter(
        AgentTool.id == tool_id,
        AgentTool.agent_id == agent_id
    ).first()
    
    if not tool:
        raise HTTPException(404, "Tool not found")
    
    # Create config
    config = APIToolConfig(
        name=tool.name,
        description=tool.description,
        url=tool.api_url,
        method=tool.method,
        headers=tool.headers or {},
        auth_type=tool.auth_type,
        auth_value=tool.auth_value,
        request_body_template=tool.request_body_template,
        response_path=tool.response_path,
    )
    
    # Test the tool
    api_tool = CustomAPITool(config)
    try:
        result = await api_tool.call(test_data.parameters)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.delete("/{tool_id}", status_code=204)
async def delete_tool(
    agent_id: UUID,
    tool_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a tool"""
    verify_agent_access(agent_id, current_user.id, db)
    
    tool = db.query(AgentTool).filter(
        AgentTool.id == tool_id,
        AgentTool.agent_id == agent_id
    ).first()
    
    if not tool:
        raise HTTPException(404, "Tool not found")
    
    db.delete(tool)
    db.commit()
    
    return None


@router.patch("/{tool_id}/toggle", response_model=ToolResponse)
async def toggle_tool(
    agent_id: UUID,
    tool_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enable/disable a tool"""
    verify_agent_access(agent_id, current_user.id, db)
    
    tool = db.query(AgentTool).filter(
        AgentTool.id == tool_id,
        AgentTool.agent_id == agent_id
    ).first()
    
    if not tool:
        raise HTTPException(404, "Tool not found")
    
    tool.is_active = not tool.is_active
    db.commit()
    db.refresh(tool)
    
    return tool