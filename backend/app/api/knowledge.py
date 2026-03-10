from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import os
import shutil
import asyncio

from app.db.database import get_db
from app.models.models import User, Agent, KnowledgeBase, KnowledgeFolder
from app.schemas.schemas import (
    KnowledgeBaseResponse, 
    BulkUploadResponse, 
    FileUploadStatus,
    FolderResponse,
    FolderCreate,
    FolderUpdate,
    FileMoveRequest,
    KnowledgeCombinedResponse
)
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


async def process_single_file(
    agent_id: UUID,
    file: UploadFile,
    db: Session,
) -> FileUploadStatus:
    """
    Process a single file upload in the background for bulk processing.
    Returns a status object with success/error info instead of throwing HTTP exceptions.
    """
    filename = file.filename
    
    try:
        # Validate file type
        file_extension = filename.split(".")[-1].lower()
        if file_extension not in ["pdf", "txt", "csv"]:
            return FileUploadStatus(
                filename=filename,
                success=False,
                error="Unsupported file type. Supported: PDF, TXT, CSV",
                chunk_count=0,
            )

        # Validate file size
        content = await file.read()
        file_size = len(content)

        if file_size > settings.MAX_UPLOAD_SIZE:
            return FileUploadStatus(
                filename=filename,
                success=False,
                error=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB",
                chunk_count=0,
            )

        # Save file
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        file_path = os.path.join(settings.UPLOAD_DIR, f"{agent_id}_{filename}")

        with open(file_path, "wb") as buffer:
            buffer.write(content)

        # Process document
        chunks = await document_processor.process_document(file_path, file_extension)

        # Add to vector store
        chunk_count = await vector_store.add_documents(str(agent_id), chunks)

        # Save to database
        knowledge_base = KnowledgeBase(
            agent_id=agent_id,
            filename=filename,
            file_type=file_extension,
            file_path=file_path,
            size=file_size,
            chunk_count=chunk_count,
        )

        db.add(knowledge_base)
        db.commit()
        db.refresh(knowledge_base)

        return FileUploadStatus(
            filename=filename,
            success=True,
            error=None,
            chunk_count=chunk_count,
            knowledge_id=str(knowledge_base.id),
        )

    except Exception as e:
        # Clean up file if processing failed
        file_path_attempt = os.path.join(settings.UPLOAD_DIR, f"{agent_id}_{filename}")
        if os.path.exists(file_path_attempt):
            os.remove(file_path_attempt)
        
        return FileUploadStatus(
            filename=filename,
            success=False,
            error=str(e),
            chunk_count=0,
        )


# ─────────────────────────────────────────
# NEW: Bulk Upload Endpoint
# ─────────────────────────────────────────
@router.post("/bulk", response_model=BulkUploadResponse)
async def bulk_upload_knowledge(
    agent_id: UUID,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload multiple files at once to agent's knowledge base
    
    - Max 20 files per request
    - Processes files in parallel
    - Returns status for each file (success/failure)
    """
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    # Limit number of files to prevent memory overload
    if len(files) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 20 files per bulk upload",
        )

    # Process all files in parallel using asyncio.gather
    tasks = [process_single_file(agent_id, file, db) for file in files]
    results = await asyncio.gather(*tasks)

    # Count successes and failures
    successful = sum(1 for r in results if r.success)
    failed = sum(1 for r in results if not r.success)

    return BulkUploadResponse(
        total=len(files),
        successful=successful,
        failed=failed,
        files=results,
    )


# ─────────────────────────────────────────
# EXISTING: Single Upload & Management
# ─────────────────────────────────────────
@router.post("", response_model=KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED)
async def upload_knowledge(
    agent_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a single file to agent's knowledge base"""
    verify_agent_access(agent_id, current_user.id, db)

    file_extension = file.filename.split(".")[-1].lower()
    if file_extension not in ["pdf", "txt", "csv"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Supported: PDF, TXT, CSV",
        )

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB",
        )

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, f"{agent_id}_{file.filename}")

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        chunks = await document_processor.process_document(file_path, file_extension)
        chunk_count = await vector_store.add_documents(str(agent_id), chunks)

        knowledge_base = KnowledgeBase(
            agent_id=agent_id,
            filename=file.filename,
            file_type=file_extension,
            file_path=file_path,
            size=file_size,
            chunk_count=chunk_count,
        )

        db.add(knowledge_base)
        db.commit()
        db.refresh(knowledge_base)

        return knowledge_base

    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing file: {str(e)}",
        )

# Update the existing GET route
@router.get("", response_model=KnowledgeCombinedResponse) 
async def list_knowledge(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all files and folders for an agent"""
    verify_agent_access(agent_id, current_user.id, db)

    files = db.query(KnowledgeBase).filter(KnowledgeBase.agent_id == agent_id).all()
    folders = db.query(KnowledgeFolder).filter(KnowledgeFolder.agent_id == agent_id).all()

    return {"files": files, "folders": folders}

# --- Folder Routes ---

@router.post("/folders", response_model=FolderResponse)
async def create_folder(
    agent_id: UUID,
    folder: FolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_access(agent_id, current_user.id, db)
    new_folder = KnowledgeFolder(agent_id=agent_id, name=folder.name, parent_id=folder.parent_id)
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return new_folder

@router.put("/folders/{folder_id}", response_model=FolderResponse)
async def rename_folder(
    agent_id: UUID,
    folder_id: UUID,
    update_data: FolderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_access(agent_id, current_user.id, db)
    folder = db.query(KnowledgeFolder).filter(KnowledgeFolder.id == folder_id, KnowledgeFolder.agent_id == agent_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    folder.name = update_data.name
    db.commit()
    db.refresh(folder)
    return folder

@router.put("/{knowledge_id}/move")
async def move_file(
    agent_id: UUID,
    knowledge_id: UUID,
    move_data: FileMoveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_access(agent_id, current_user.id, db)
    file = db.query(KnowledgeBase).filter(KnowledgeBase.id == knowledge_id, KnowledgeBase.agent_id == agent_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    file.folder_id = move_data.folder_id
    db.commit()
    return {"success": True}

@router.delete("/{knowledge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge(
    agent_id: UUID,
    knowledge_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a knowledge base file"""
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

    if os.path.exists(knowledge.file_path):
        os.remove(knowledge.file_path)

    db.delete(knowledge)
    db.commit()

    return None


@router.delete("/folders/{folder_id}")
async def delete_folder(
    agent_id: UUID,
    folder_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_access(agent_id, current_user.id, db)
    
    folder = db.query(KnowledgeFolder).filter(
        KnowledgeFolder.id == folder_id, 
        KnowledgeFolder.agent_id == agent_id
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    db.delete(folder)
    db.commit()
    
    return {"success": True}