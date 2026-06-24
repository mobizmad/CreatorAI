from typing import List, Dict

AGENTBUILDER_BASE_PROMPT = """You are a helpful AI assistant created by a user on the AgentBuilder platform.

## Your Purpose
You have been trained on specific knowledge provided by your creator. Your primary goal is to answer questions accurately based on this knowledge base.

## Core Guidelines

1. **Knowledge-First Approach**
   - Always prioritize information from the "Relevant Knowledge" section provided below
   - If the answer is in your knowledge base, use it directly
   - Be specific and cite details from the provided knowledge when possible

2. **Accuracy & Honesty**
   - If the answer is NOT in your knowledge base, clearly state: "I don't have information about this in my knowledge base."
   - Do not make up information or hallucinate facts
   - If you're uncertain, express your uncertainty

3. **Conversation Awareness**
   - You have access to the conversation history below
   - Use it to understand context, follow-up questions, and references like "it", "that", "the same one"
   - If the user refers to something mentioned earlier, use that context
   - Maintain a consistent, friendly tone throughout the conversation

4. **Learning from Corrections**
   - Pay special attention to the "Previous Corrections" section below
   - These are examples where you previously made mistakes that were corrected by your creator
   - Avoid repeating these mistakes in future responses

5. **Concise & Clear Communication**
   - Provide clear, well-structured answers
   - Be concise but thorough
   - Use bullet points or numbered lists when appropriate

6. **Stay in Scope**
   - Focus on answering questions related to your knowledge base
   - Politely redirect off-topic questions

## Response Format
When answering:
- Start with a direct answer to the question
- Support your answer with relevant details from the knowledge base
- If applicable, mention the source or context of the information
"""


def build_system_prompt(
    base_prompt: str,
    custom_instructions: str,
    retrieved_docs: List[Dict],
    few_shot_examples: List[Dict],
) -> str:
    """
    Build the complete system prompt with dynamic sections.
    Note: conversation history is passed as actual messages, not in system prompt.
    """
    prompt_parts = []

    # Add base prompt
    if base_prompt:
        prompt_parts.append(base_prompt)
    else:
        prompt_parts.append(AGENTBUILDER_BASE_PROMPT)

    # Add custom instructions if provided
    if custom_instructions:
        prompt_parts.append("\n## Additional Instructions from Creator\n")
        prompt_parts.append(custom_instructions)

    # Add retrieved knowledge (RAG)
    if retrieved_docs:
        prompt_parts.append("\n## Relevant Knowledge\n")
        prompt_parts.append(
            "Use the following information from your knowledge base to answer the question:\n\n"
        )
        for i, doc in enumerate(retrieved_docs, 1):
            source = doc.get("metadata", {}).get("source_file", "Unknown")
            prompt_parts.append(f"**Source {i}** ({source}):\n{doc['text']}\n\n")

    # Add few-shot examples (corrections)
    if few_shot_examples:
        prompt_parts.append("\n## Previous Corrections (Learn from these)\n")
        prompt_parts.append(
            "Your creator has corrected these responses. Learn from them to avoid similar mistakes:\n\n"
        )
        for i, example in enumerate(few_shot_examples, 1):
            prompt_parts.append(f"**Example {i}:**\n")
            prompt_parts.append(f"User Query: {example['user_query']}\n")
            prompt_parts.append(f"Your Incorrect Response: {example['incorrect_response']}\n")
            prompt_parts.append(f"Correct Response: {example['corrected_response']}\n\n")

    prompt_parts.append(
        "\n---\n\nNow, please answer the following question based on the guidelines, knowledge, and conversation history provided.\n"
    )

    return "".join(prompt_parts)


def format_messages_with_history(
    system_prompt: str,
    conversation_history: List[Dict],
    user_message: str,
) -> List[Dict[str, str]]:
    """
    NEW: Format messages with full conversation history for memory.

    Structure sent to LLM:
    [
        {"role": "system", "content": "..."},   <- system prompt
        {"role": "user", "content": "..."},     <- past message 1
        {"role": "assistant", "content": "..."}, <- past response 1
        {"role": "user", "content": "..."},     <- past message 2
        {"role": "assistant", "content": "..."}, <- past response 2
        ...
        {"role": "user", "content": "..."},     <- CURRENT message (latest)
    ]
    """
    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history (already in [user, assistant, user, assistant...] format)
    messages.extend(conversation_history)

    # Add current user message
    messages.append({"role": "user", "content": user_message})

    return messages


def format_messages_for_llm(
    system_prompt: str,
    user_message: str,
) -> List[Dict[str, str]]:
    """Original single-turn format (kept for backwards compatibility)"""
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
