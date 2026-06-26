import json
import os
import tempfile
import asyncio
import httpx
import secrets
from fastapi import BackgroundTasks
from fastapi import UploadFile, File
from openai import AsyncOpenAI

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from datetime import datetime

from app.db.database import get_db
from app.models.models import (
    User,
    Agent,
    AgentTool,
    AgentIntegration,
    ChannelBroadcast,
    ChannelConversation,
    ChannelLead,
    ChannelMessage,
)
from app.config import settings
from app.schemas.schemas import (
    AgentCreate,
    AgentUpdate,
    AgentResponse,
    AgentModelUpdate,
    AgentIntegrationUpsert,
    AgentIntegrationResponse,
    ChannelBroadcastCreate,
    ChannelBroadcastResponse,
    ChannelConversationResponse,
    ChannelConversationUpdate,
    ChannelShareResponse,
    ChannelShareUpdate,
    ChannelLeadCreate,
    ChannelLeadResponse,
    ChannelMessageCreate,
    ChannelMessageResponse,
)
from app.api.auth import get_current_user
from app.tools.builtin_agent_tools import BUILTIN_TOOL_DEFINITIONS

router = APIRouter(prefix="/agents", tags=["Agents"])

DEFAULT_OLLAMA_AGENT_MODEL = "gemma4:latest"
OPENAI_ONLY_MODELS = {"gpt-4", "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"}
SUPPORTED_INTEGRATIONS = {"facebook", "line", "telegram"}


def repair_agent_llm_config(agent: Agent, db: Session) -> Agent:
    if agent.llm_provider == "ollama" and (
        not agent.llm_model or agent.llm_model in OPENAI_ONLY_MODELS or agent.llm_model.startswith("gpt-")
    ):
        agent.llm_model = DEFAULT_OLLAMA_AGENT_MODEL
        db.add(agent)
        db.commit()
        db.refresh(agent)
    return agent


def mask_integration(integration: AgentIntegration) -> AgentIntegrationResponse:
    return AgentIntegrationResponse(
        id=integration.id,
        agent_id=integration.agent_id,
        provider=integration.provider,
        display_name=integration.display_name,
        channel_id=integration.channel_id,
        page_id=integration.page_id,
        bot_username=integration.bot_username,
        app_id=integration.app_id,
        has_app_secret=bool(integration.app_secret),
        has_channel_secret=bool(integration.channel_secret),
        has_access_token=bool(integration.access_token),
        has_bot_token=bool(integration.bot_token),
        has_verify_token=bool(integration.verify_token),
        webhook_url=integration.webhook_url,
        required_scopes=integration.required_scopes,
        notes=integration.notes,
        auto_reply_enabled=integration.auto_reply_enabled if integration.auto_reply_enabled is not None else True,
        human_takeover_enabled=integration.human_takeover_enabled or False,
        business_hours_enabled=integration.business_hours_enabled or False,
        business_hours_timezone=integration.business_hours_timezone,
        business_hours_start=integration.business_hours_start,
        business_hours_end=integration.business_hours_end,
        after_hours_message=integration.after_hours_message,
        channel_prompt=integration.channel_prompt,
        fallback_message=integration.fallback_message,
        is_active=integration.is_active,
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


def build_webhook_url(provider: str, agent_id: UUID) -> str:
    return f"{settings.PUBLIC_API_BASE_URL.rstrip('/')}/integrations/{provider}/webhook/{agent_id}"


def build_channel_share_url(agent: Agent) -> str | None:
    if not agent.channel_share_enabled or not agent.channel_share_token:
        return None
    return f"{settings.PUBLIC_API_BASE_URL.rstrip('/')}/channel-inbox/{agent.id}?token={agent.channel_share_token}"


def verify_agent_owner(agent_id: UUID, user_id: UUID, db: Session) -> Agent:
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


async def push_line_message(access_token: str | None, to: str | None, text: str) -> None:
    if not access_token or not to:
        raise HTTPException(status_code=400, detail="LINE access token or customer ID is missing.")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.line.me/v2/bot/message/push",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "to": to,
                "messages": [{"type": "text", "text": text[:5000]}],
            },
        )
    if response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"LINE did not accept the manual reply: {response.text[:300]}",
        )


async def push_telegram_message(bot_token: str | None, chat_id: str | None, text: str) -> None:
    if not bot_token or not chat_id:
        raise HTTPException(status_code=400, detail="Telegram bot token or chat ID is missing.")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text[:4096]},
        )
    if response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"Telegram did not accept the manual reply: {response.text[:300]}",
        )


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    agent_data: AgentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new agent"""
    new_agent = Agent(
        user_id=current_user.id,
        name=agent_data.name,
        description=agent_data.description,
        system_prompt=agent_data.system_prompt,
        output_template=agent_data.output_template,
        llm_provider=agent_data.llm_provider,
        llm_model=agent_data.llm_model,
        ollama_endpoint=agent_data.ollama_endpoint,
        api_key=agent_data.api_key,
        temperature=agent_data.temperature,
    )

    db.add(new_agent)
    db.flush()

    for tool_type in agent_data.enabled_tools or []:
        definition = BUILTIN_TOOL_DEFINITIONS.get(tool_type)
        if not definition:
            continue
        tool_settings = (agent_data.tool_settings or {}).get(tool_type) or {}
        db.add(
            AgentTool(
                agent_id=new_agent.id,
                name=definition["name"],
                description=definition["description"],
                tool_type=tool_type,
                request_body_template=tool_settings,
                is_active=True,
            )
        )

    db.commit()
    db.refresh(new_agent)

    return repair_agent_llm_config(new_agent, db)


@router.get("", response_model=List[AgentResponse])
async def list_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all agents for the current user"""
    agents = db.query(Agent).filter(Agent.user_id == current_user.id).all()
    for agent in agents:
        repair_agent_llm_config(agent, db)
    return agents


@router.get("/{agent_id}/integrations", response_model=List[AgentIntegrationResponse])
async def list_agent_integrations(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_owner(agent_id, current_user.id, db)
    integrations = (
        db.query(AgentIntegration)
        .filter(AgentIntegration.agent_id == agent_id)
        .order_by(AgentIntegration.provider.asc())
        .all()
    )
    return [mask_integration(integration) for integration in integrations]


@router.put("/{agent_id}/integrations/{provider}", response_model=AgentIntegrationResponse)
async def upsert_agent_integration(
    agent_id: UUID,
    provider: str,
    integration_data: AgentIntegrationUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = provider.lower()
    if provider not in SUPPORTED_INTEGRATIONS:
        raise HTTPException(status_code=400, detail="Supported providers are facebook, line, and telegram.")

    verify_agent_owner(agent_id, current_user.id, db)
    integration = (
        db.query(AgentIntegration)
        .filter(AgentIntegration.agent_id == agent_id, AgentIntegration.provider == provider)
        .first()
    )
    if not integration:
        integration = AgentIntegration(
            agent_id=agent_id,
            provider=provider,
            webhook_url=build_webhook_url(provider, agent_id),
        )
        db.add(integration)

    update_data = integration_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is None:
            continue
        setattr(integration, field, value)

    integration.webhook_url = build_webhook_url(provider, agent_id)
    db.commit()
    db.refresh(integration)
    return mask_integration(integration)


@router.delete("/{agent_id}/integrations/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_integration(
    agent_id: UUID,
    provider: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = provider.lower()
    verify_agent_owner(agent_id, current_user.id, db)
    integration = (
        db.query(AgentIntegration)
        .filter(AgentIntegration.agent_id == agent_id, AgentIntegration.provider == provider)
        .first()
    )
    if integration:
        db.delete(integration)
        db.commit()
    return None


@router.get("/{agent_id}/channel-share", response_model=ChannelShareResponse)
async def get_channel_share(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    agent = verify_agent_owner(agent_id, current_user.id, db)
    if agent.channel_share_enabled and not agent.channel_share_token:
        agent.channel_share_token = secrets.token_urlsafe(32)
        db.commit()
        db.refresh(agent)
    return ChannelShareResponse(
        enabled=bool(agent.channel_share_enabled),
        token=agent.channel_share_token if agent.channel_share_enabled else None,
        url=build_channel_share_url(agent),
    )


@router.patch("/{agent_id}/channel-share", response_model=ChannelShareResponse)
async def update_channel_share(
    agent_id: UUID,
    payload: ChannelShareUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    agent = verify_agent_owner(agent_id, current_user.id, db)
    agent.channel_share_enabled = payload.enabled
    if payload.enabled and not agent.channel_share_token:
        agent.channel_share_token = secrets.token_urlsafe(32)
    db.commit()
    db.refresh(agent)
    return ChannelShareResponse(
        enabled=bool(agent.channel_share_enabled),
        token=agent.channel_share_token if agent.channel_share_enabled else None,
        url=build_channel_share_url(agent),
    )


@router.get("/{agent_id}/channel-conversations", response_model=List[ChannelConversationResponse])
async def list_channel_conversations(
    agent_id: UUID,
    provider: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_owner(agent_id, current_user.id, db)
    query = db.query(ChannelConversation).filter(ChannelConversation.agent_id == agent_id)
    if provider and provider != "all":
        query = query.filter(ChannelConversation.provider == provider)
    return query.order_by(ChannelConversation.last_message_at.desc()).limit(100).all()


@router.patch("/{agent_id}/channel-conversations/{conversation_id}", response_model=ChannelConversationResponse)
async def update_channel_conversation(
    agent_id: UUID,
    conversation_id: UUID,
    payload: ChannelConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_owner(agent_id, current_user.id, db)
    conversation = (
        db.query(ChannelConversation)
        .filter(ChannelConversation.id == conversation_id, ChannelConversation.agent_id == agent_id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(conversation, field, value)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.post(
    "/{agent_id}/channel-conversations/{conversation_id}/messages",
    response_model=ChannelMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_channel_message(
    agent_id: UUID,
    conversation_id: UUID,
    payload: ChannelMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_owner(agent_id, current_user.id, db)
    conversation = (
        db.query(ChannelConversation)
        .filter(ChannelConversation.id == conversation_id, ChannelConversation.agent_id == agent_id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    integration = (
        db.query(AgentIntegration)
        .filter(
            AgentIntegration.agent_id == agent_id,
            AgentIntegration.provider == conversation.provider,
            AgentIntegration.is_active == True,
        )
        .first()
    )
    if conversation.provider == "line":
        if not integration:
            raise HTTPException(status_code=404, detail="LINE integration is not active for this agent.")
        await push_line_message(
            integration.access_token,
            conversation.external_chat_id or conversation.external_user_id,
            payload.text,
        )
    elif conversation.provider == "telegram":
        if not integration:
            raise HTTPException(status_code=404, detail="Telegram integration is not active for this agent.")
        await push_telegram_message(
            integration.bot_token,
            conversation.external_chat_id or conversation.external_user_id,
            payload.text,
        )

    message = ChannelMessage(
        conversation_id=conversation.id,
        direction="outbound",
        sender_type="human",
        text=payload.text,
    )
    conversation.last_message_preview = payload.text[:180]
    conversation.last_message_at = datetime.utcnow()
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@router.get("/{agent_id}/channel-leads", response_model=List[ChannelLeadResponse])
async def list_channel_leads(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_owner(agent_id, current_user.id, db)
    return (
        db.query(ChannelLead)
        .filter(ChannelLead.agent_id == agent_id)
        .order_by(ChannelLead.created_at.desc())
        .limit(200)
        .all()
    )


@router.post("/{agent_id}/channel-leads", response_model=ChannelLeadResponse, status_code=status.HTTP_201_CREATED)
async def create_channel_lead(
    agent_id: UUID,
    payload: ChannelLeadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_owner(agent_id, current_user.id, db)
    lead = ChannelLead(agent_id=agent_id, **payload.model_dump())
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.get("/{agent_id}/channel-broadcasts", response_model=List[ChannelBroadcastResponse])
async def list_channel_broadcasts(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_owner(agent_id, current_user.id, db)
    return (
        db.query(ChannelBroadcast)
        .filter(ChannelBroadcast.agent_id == agent_id)
        .order_by(ChannelBroadcast.created_at.desc())
        .limit(100)
        .all()
    )


@router.post("/{agent_id}/channel-broadcasts", response_model=ChannelBroadcastResponse, status_code=status.HTTP_201_CREATED)
async def create_channel_broadcast(
    agent_id: UUID,
    payload: ChannelBroadcastCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_owner(agent_id, current_user.id, db)
    broadcast = ChannelBroadcast(agent_id=agent_id, **payload.model_dump())
    db.add(broadcast)
    db.commit()
    db.refresh(broadcast)
    return broadcast

@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: UUID,
    agent_data: AgentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an agent (handles partial updates for toggles)"""
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.user_id == current_user.id)
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found"
        )

    update_data = agent_data.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(agent, field, value)

    db.commit()
    db.refresh(agent)

    return repair_agent_llm_config(agent, db)

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific agent (This allows the Playground to load)"""
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.user_id == current_user.id)
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found"
        )

    return repair_agent_llm_config(agent, db)


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: UUID,
    agent_data: AgentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an agent (This allows the toggles to save)"""
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.user_id == current_user.id)
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found"
        )

    # Partial update logic
    update_data = agent_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(agent, field, value)

    db.commit()
    db.refresh(agent)

    return repair_agent_llm_config(agent, db)

@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an agent"""
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.user_id == current_user.id)
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found"
        )

    # Also delete the vector store index
    from app.services.vector_store import VectorStoreService

    vector_store = VectorStoreService()
    await vector_store.delete_index(str(agent_id))

    db.delete(agent)
    db.commit()

    return None


# Initialize OpenAI client (Ensure OPENAI_API_KEY is in your .env)
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

@router.post("/{agent_id}/finetune/upload")
async def upload_finetune_data(
    agent_id: UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a JSONL file, validate it, and start an OpenAI fine-tuning job"""
    # 1. Verify access
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or access denied")

    if not file.filename.endswith('.jsonl'):
        raise HTTPException(status_code=400, detail="File must be a .jsonl format")

    # 2. Read and Validate the JSONL file
    content = await file.read()
    lines = content.decode("utf-8").splitlines()
    
    if len(lines) < 10:
        raise HTTPException(status_code=400, detail="OpenAI requires at least 10 examples to fine-tune.")

    for i, line in enumerate(lines):
        try:
            data = json.loads(line)
            if "messages" not in data:
                raise ValueError("Missing 'messages' array")
            
            # Ensure it has the correct roles
            roles = [msg.get("role") for msg in data["messages"]]
            if "user" not in roles or "assistant" not in roles:
                raise ValueError("Each line must contain at least one 'user' and 'assistant' message")
                
        except Exception as e:
            raise HTTPException(
                status_code=400, 
                detail=f"Validation failed on line {i + 1}: {str(e)}"
            )

    # 3. Save temporarily to upload to OpenAI
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jsonl") as temp_file:
        temp_file.write(content)
        temp_file_path = temp_file.name

    try:
        # 4. Upload file to OpenAI Storage
        with open(temp_file_path, "rb") as f:
            openai_file = await openai_client.files.create(
                file=f,
                purpose="fine-tune"
            )

        # 5. Trigger the Fine-Tuning Job
        job = await openai_client.fine_tuning.jobs.create(
            training_file=openai_file.id,
            model="gpt-4o-mini-2024-07-18"
        )

        # Update status in DB
        agent.is_training = True 
        db.commit()

        background_tasks.add_task(
            monitor_and_update_model, 
            agent_id, 
            job.id, 
            get_db 
        )

        return {
            "message": "Fine-tuning job started successfully!",
            "job_id": job.id,
            "status": job.status,
            "file_id": openai_file.id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI API Error: {str(e)}")
    finally:
        # Clean up the temp file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


@router.patch("/{agent_id}/model")
async def update_agent_model(
    agent_id: UUID,
    update_data: AgentModelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Updates the agent to use the new fine-tuned model ID"""
    
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or access denied")
        
    # Overwrite the old model with the new fine-tuned model ID
    agent.llm_model = update_data.llm_model
    
    db.commit()
    db.refresh(agent)
    
    return {
        "message": "Agent model updated successfully!", 
        "llm_model": agent.llm_model
    }

async def monitor_and_update_model(agent_id: UUID, job_id: str, db_session_factory):
    """Polls OpenAI every 60s and updates the database when the job is done"""
    while True:
        await asyncio.sleep(60)
        try:
            job = await openai_client.fine_tuning.jobs.retrieve(job_id)
            
            if job.status == "succeeded":
                new_model_name = job.fine_tuned_model
                
                db_gen = db_session_factory()
                db = next(db_gen) 
                try:
                    agent = db.query(Agent).filter(Agent.id == agent_id).first()
                    if agent:
                        agent.llm_model = new_model_name
                        agent.is_training = False  # <--- UPDATED: Turn off training status
                        db.commit()
                        print(f"Successfully auto-updated Agent {agent_id} to {new_model_name}")
                finally:
                    db_gen.close() 
                break
                
            elif job.status in ["failed", "cancelled"]:
                # If it fails, we still need to turn off the training status in the DB
                db_gen = db_session_factory()
                db = next(db_gen)
                try:
                    agent = db.query(Agent).filter(Agent.id == agent_id).first()
                    if agent:
                        agent.is_training = False  # <--- UPDATED: Turn off training status
                        db.commit()
                finally:
                    db_gen.close()
                print(f"Fine-tuning job {job_id} failed or was cancelled.")
                break
        except Exception as e:
            print(f"Error monitoring fine-tune job: {e}")
            break
