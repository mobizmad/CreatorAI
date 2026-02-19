import json
import os
import tempfile
import asyncio
from fastapi import BackgroundTasks
from fastapi import UploadFile, File
from openai import AsyncOpenAI

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.db.database import get_db
from app.models.models import User, Agent
from app.schemas.schemas import AgentCreate, AgentUpdate, AgentResponse, AgentModelUpdate
from app.api.auth import get_current_user

router = APIRouter(prefix="/agents", tags=["Agents"])


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
        llm_provider=agent_data.llm_provider,
        llm_model=agent_data.llm_model,
        ollama_endpoint=agent_data.ollama_endpoint,
        api_key=agent_data.api_key,
        temperature=agent_data.temperature,
    )

    db.add(new_agent)
    db.commit()
    db.refresh(new_agent)

    return new_agent


@router.get("", response_model=List[AgentResponse])
async def list_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all agents for the current user"""
    agents = db.query(Agent).filter(Agent.user_id == current_user.id).all()
    return agents


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific agent"""
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.user_id == current_user.id)
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found"
        )

    return agent


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: UUID,
    agent_data: AgentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an agent"""
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.user_id == current_user.id)
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found"
        )

    # Update fields
    update_data = agent_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(agent, field, value)

    db.commit()
    db.refresh(agent)

    return agent


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