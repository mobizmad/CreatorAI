from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader, CSVLoader
from typing import List
import os


class DocumentProcessor:
    """
    Service for processing and chunking documents
    Supports PDF, TXT, and CSV files
    """

    def __init__(
        self, chunk_size: int = 1000, chunk_overlap: int = 200
    ):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", " ", ""],
        )

    async def process_document(
        self, file_path: str, file_type: str
    ) -> List[dict]:
        """
        Process a document and return chunks

        Args:
            file_path: Path to the file
            file_type: Type of file (pdf, txt, csv)

        Returns:
            List of document chunks with metadata
        """
        # Load document based on type
        if file_type.lower() == "pdf":
            loader = PyPDFLoader(file_path)
        elif file_type.lower() in ["txt", "text"]:
            loader = TextLoader(file_path)
        elif file_type.lower() == "csv":
            loader = CSVLoader(file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

        try:
            # Load and split documents
            documents = loader.load()
            chunks = self.text_splitter.split_documents(documents)

            # Format chunks with metadata
            formatted_chunks = []
            for i, chunk in enumerate(chunks):
                formatted_chunks.append(
                    {
                        "text": chunk.page_content,
                        "metadata": {
                            **chunk.metadata,
                            "chunk_index": i,
                            "source_file": os.path.basename(file_path),
                        },
                    }
                )

            return formatted_chunks

        except Exception as e:
            raise Exception(f"Error processing document: {str(e)}")

    def extract_text_from_chunks(self, chunks: List[dict]) -> str:
        """Extract plain text from chunks for context"""
        return "\n\n".join([chunk["text"] for chunk in chunks])
