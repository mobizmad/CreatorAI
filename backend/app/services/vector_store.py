from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from typing import List
import os
import shutil
import asyncio
from app.config import settings


class VectorStoreService:
    """
    Service for managing vector embeddings and similarity search
    Uses FAISS (local vector database) - NO API KEY NEEDED!
    """

    def __init__(self):
        self.embeddings = None
        self.vector_store_dir = "./vector_stores"
        self._initialize_embeddings()
        os.makedirs(self.vector_store_dir, exist_ok=True)

    def _initialize_embeddings(self):
        """Initialize embedding model"""
        if settings.OPENAI_API_KEY:
            self.embeddings = OpenAIEmbeddings(
                openai_api_key=settings.OPENAI_API_KEY
            )
        else:
            print("Warning: OPENAI_API_KEY not set. Embeddings will not work.")

    def _get_vector_store_path(self, agent_id: str) -> str:
        """Get the file path for an agent's vector store"""
        return os.path.join(self.vector_store_dir, f"agent_{agent_id}")

    def _load_vector_store(self, agent_id: str):
        """Load existing vector store from disk"""
        path = self._get_vector_store_path(agent_id)
        if os.path.exists(path):
            return FAISS.load_local(
                path,
                self.embeddings,
                allow_dangerous_deserialization=True
            )
        return None

    def _save_vector_store(self, agent_id: str, vectorstore):
        """Save vector store to disk"""
        path = self._get_vector_store_path(agent_id)
        vectorstore.save_local(path)

    async def add_documents(
        self, agent_id: str, chunks: List[dict]
    ) -> int:
        """
        Add document chunks to the vector store using safe batching
        """
        if not self.embeddings:
            raise Exception("Embeddings not initialized. Please set OPENAI_API_KEY.")

        from langchain.schema import Document

        documents = [
            Document(page_content=chunk["text"], metadata=chunk["metadata"])
            for chunk in chunks
        ]

        # Load existing vector store
        vectorstore = self._load_vector_store(agent_id)

        batch_size = 100 # Safe number of chunks to embed per API call
        total_docs = len(documents)
        print(f"Starting batch embedding for {total_docs} chunks...")

        # Process the chunks in small batches
        for i in range(0, total_docs, batch_size):
            batch = documents[i : i + batch_size]
            if vectorstore:
                # Use asyncio.to_thread so we don't freeze the FastAPI server!
                await asyncio.to_thread(vectorstore.add_documents, batch)
            else:
                # Create the store using the very first batch
                vectorstore = await asyncio.to_thread(
                    FAISS.from_documents,
                    documents=batch,
                    embedding=self.embeddings,
                )
            print(f"Embedded batch {i} to {min(i + batch_size, total_docs)}...")
            # THE LIFESAVER: Pause to avoid OpenAI Rate Limit (429) errors
            await asyncio.sleep(1)

        # Save to disk only after all batches are safely processed
        if vectorstore:
            await asyncio.to_thread(self._save_vector_store, agent_id, vectorstore)

        print(f"Successfully finished embedding {total_docs} chunks!")
        return total_docs

    async def similarity_search(
        self, agent_id: str, query: str, k: int = 4
    ) -> List[dict]:
        """
        Perform similarity search

        Args:
            agent_id: Agent UUID
            query: Search query
            k: Number of results to return

        Returns:
            List of similar documents with content and metadata
        """
        if not self.embeddings:
            raise Exception("Embeddings not initialized. Please set OPENAI_API_KEY.")

        # Load vector store
        vectorstore = self._load_vector_store(agent_id)

        if not vectorstore:
            print(f"No vector store found for agent {agent_id}")
            return []

        try:
            # Perform search
            results = vectorstore.similarity_search(query, k=k)

            # Format results
            formatted_results = []
            for doc in results:
                formatted_results.append(
                    {"text": doc.page_content, "metadata": doc.metadata}
                )

            return formatted_results

        except Exception as e:
            print(f"Error during similarity search: {str(e)}")
            return []

    async def delete_index(self, agent_id: str):
        """Delete an agent's vector store"""
        path = self._get_vector_store_path(agent_id)

        try:
            if os.path.exists(path):
                shutil.rmtree(path)
                print(f"Deleted vector store for agent {agent_id}")
        except Exception as e:
            print(f"Error deleting vector store: {str(e)}")
