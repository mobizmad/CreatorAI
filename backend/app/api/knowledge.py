from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import os
import shutil

from app.db.database import get_db
from app.models.models import User, Agent, KnowledgeBase
from app.schemas.schemas import KnowledgeBaseResponse
from app.api.auth import get_current_user
from app.services.document_processor import DocumentProcessor
from app.services.vector_store import VectorStoreService
from app.config import settings

router = APIRouter(prefix="/agents/{agent_id}/knowledge", tags=["Knowledge Base"])

# Initialize services
document_processor = DocumentProcessor()
vector_store = VectorStoreService()


def verify_agent_access(agent_id: UUID, user_id: UUID, db: Session) -> Agent:
    """Verify user has access to agent"""
    agent = (
        db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == user_id).first()
    )
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found or access denied",
        )
    return agent


@router.post("", response_model=KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED)
async def upload_knowledge(
    agent_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to agent's knowledge base"""
    # Verify access
    agent = verify_agent_access(agent_id, current_user.id, db)

    # Validate file type
    file_extension = file.filename.split(".")[-1].lower()
    if file_extension not in ["pdf", "txt", "csv"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Supported: PDF, TXT, CSV",
        )

    # Validate file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning

    if file_size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB",
        )

    # Save file
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(
        settings.UPLOAD_DIR, f"{agent_id}_{file.filename}"
    )

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Process document
        chunks = await document_processor.process_document(file_path, file_extension)

        # Add to vector store
        chunk_count = await vector_store.add_documents(str(agent_id), chunks)

        # Save to database
        knowledge_base = KnowledgeBase(
            agent_id=agent_id,
            filename=file.filename,
            file_type=file_extension,
            file_path=file_path,
            chunk_count=chunk_count,
        )

        db.add(knowledge_base)
        db.commit()
        db.refresh(knowledge_base)

        return knowledge_base

    except Exception as e:
        # Clean up file if processing failed
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing file: {str(e)}",
        )


@router.get("", response_model=List[KnowledgeBaseResponse])
async def list_knowledge(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all knowledge base files for an agent"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    knowledge_bases = (
        db.query(KnowledgeBase).filter(KnowledgeBase.agent_id == agent_id).all()
    )

    return knowledge_bases


@router.delete("/{knowledge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge(
    agent_id: UUID,
    knowledge_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a knowledge base file"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    knowledge = (
        db.query(KnowledgeBase)
        .filter(
            KnowledgeBase.id == knowledge_id, KnowledgeBase.agent_id == agent_id
        )
        .first()
    )

    if not knowledge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base file not found"
        )

    # Delete physical file
    if os.path.exists(knowledge.file_path):
        os.remove(knowledge.file_path)

    # Delete from database
    db.delete(knowledge)
    db.commit()

    return None
