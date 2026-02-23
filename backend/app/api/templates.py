from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from app.db.database import get_db
from app.models.models import User, Agent, AgentTemplate, Correction
from app.schemas.schemas import (
    TemplateResponse,
    TemplateCreate,
    AgentFromTemplateRequest,
    AgentResponse,
)
from app.api.auth import get_current_user

router = APIRouter(prefix="/templates", tags=["Templates"])


@router.get("", response_model=List[TemplateResponse])
async def list_templates(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Get all available agent templates
    
    Optionally filter by category:
    - support: Customer support bots
    - hr: HR and employee assistance
    - education: Educational tutors
    - ecommerce: E-commerce helpers
    - finance: Financial advisors
    - restaurant: Food service bots
    - it: IT helpdesk
    - legal: Legal assistants
    """
    query = db.query(AgentTemplate).filter(AgentTemplate.is_public == True)
    
    if category:
        query = query.filter(AgentTemplate.category == category)
    
    templates = query.order_by(AgentTemplate.usage_count.desc()).all()
    
    return templates


@router.post("/create-from-template", response_model=AgentResponse)
async def create_agent_from_template(
    request: AgentFromTemplateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new agent from a template
    
    User can customize:
    - name (required)
    - description (optional, uses template default if not provided)
    - system_prompt (optional, uses template default if not provided)
    - output_template (optional, uses template default if not provided)
    """
    # Load template
    template = db.query(AgentTemplate).filter(
        AgentTemplate.id == request.template_id,
        AgentTemplate.is_public == True,
    ).first()
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Create agent from template with user customizations
    agent = Agent(
        user_id=current_user.id,
        name=request.name,
        description=request.description or template.description,
        system_prompt=request.system_prompt or template.system_prompt,
        output_template=request.output_template or template.output_template,
        temperature=template.temperature,
        llm_provider=request.llm_provider or template.llm_provider,
        llm_model=request.llm_model or template.llm_model,
    )
    
    db.add(agent)
    db.commit()
    db.refresh(agent)
    
    # Clone sample corrections from template
    if template.sample_corrections:
        for correction_data in template.sample_corrections:
            correction = Correction(
                agent_id=agent.id,
                user_query=correction_data.get("query", ""),
                incorrect_response="",
                corrected_response=correction_data.get("correct_response", ""),
                context=correction_data.get("context"),
                is_active=True,
            )
            db.add(correction)
    
    # Increment template usage count
    template.usage_count += 1
    
    db.commit()
    
    return agent


@router.post("/seed", status_code=status.HTTP_201_CREATED)
async def seed_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Seed database with default templates (admin only)
    Run this once to populate templates
    """
    # Check if templates already exist
    existing = db.query(AgentTemplate).count()
    if existing > 0:
        return {"message": f"{existing} templates already exist"}
    
    templates = [
        {
            "name": "Customer Support Bot",
            "description": "Handles customer inquiries, returns, and product questions with a friendly, helpful tone.",
            "category": "support",
            "icon": "📞",
            "system_prompt": """You are a professional customer support agent. Your goals:
- Respond politely and empathetically to customer concerns
- Provide accurate information from the knowledge base
- If you don't know something, say so honestly and offer to escalate
- Always end with "Is there anything else I can help you with?"

Tone: Friendly, patient, professional
Response style: Clear, concise, solution-oriented

Remember to:
- Use the customer's name if provided
- Acknowledge frustrations before solving
- Provide specific next steps""",
            "output_template": """**Summary**: [One sentence summary]

**Answer**: [Detailed response]

**Next Steps**: [What the customer should do next]

**Need Help?**: Is there anything else I can help you with?""",
            "temperature": 0.3,
            "sample_corrections": [
                {
                    "query": "How do I return this?",
                    "correct_response": "I'd be happy to help with your return! Our return policy allows returns within 30 days of purchase. Please visit your account dashboard and click 'Start Return' next to your order. You'll receive a prepaid shipping label via email. Is there anything specific about the return process I can clarify?"
                },
                {
                    "query": "Where is my order?",
                    "correct_response": "Let me help you track your order. Could you please provide your order number? It should be in your confirmation email and starts with #. Once I have that, I can check the exact status and estimated delivery date for you."
                }
            ]
        },
        {
            "name": "HR FAQ Assistant",
            "description": "Answers employee questions about company policies, benefits, and HR procedures.",
            "category": "hr",
            "icon": "📚",
            "system_prompt": """You are a knowledgeable HR assistant helping employees understand company policies.

Guidelines:
- Provide clear, accurate information from HR documents
- Be professional yet approachable
- For sensitive topics (termination, complaints), advise contacting HR directly
- Always cite the specific policy document when referencing rules
- If information might be outdated, remind employees to verify with HR

Tone: Professional, helpful, clear
Response style: Direct answers with policy references""",
            "output_template": """**Answer**: [Direct answer to the question]

**Policy Reference**: [Cite specific policy document and section]

**Additional Info**: [Any related information they should know]

**Need More Help?**: For detailed guidance, please contact HR at hr@company.com""",
            "temperature": 0.2,
            "sample_corrections": [
                {
                    "query": "How many PTO days do I get?",
                    "correct_response": "According to our PTO Policy (Section 3.2), full-time employees receive 15 PTO days per year, accrued monthly. Part-time employees receive prorated amounts. Days accrue starting from your hire date and can be used after 90 days of employment."
                }
            ]
        },
        {
            "name": "Educational Tutor",
            "description": "Patient tutor that explains concepts, helps with homework, and encourages learning.",
            "category": "education",
            "icon": "📖",
            "system_prompt": """You are an encouraging educational tutor helping students learn.

Teaching approach:
- Break complex topics into simple steps
- Use examples and analogies
- Ask guiding questions instead of giving direct answers
- Celebrate progress and encourage effort
- Adapt explanations based on student's understanding level

Tone: Patient, encouraging, enthusiastic
Response style: Step-by-step explanations with examples

Never:
- Give homework answers directly
- Make students feel bad for not understanding
- Rush through explanations""",
            "output_template": """**Let's Break It Down**:

**Step 1**: [First concept]
**Step 2**: [Second concept]
**Step 3**: [Third concept]

**Example**: [Real-world example]

**Your Turn**: [Practice question for the student]

**Need More Help?**: Let me know if any step is unclear!""",
            "temperature": 0.7,
            "sample_corrections": []
        },
        {
            "name": "E-commerce Product Helper",
            "description": "Helps customers find products, compare features, and make purchase decisions.",
            "category": "ecommerce",
            "icon": "🛒",
            "system_prompt": """You are a helpful product assistant in an online store.

Your role:
- Help customers find products that match their needs
- Compare product features accurately
- Provide honest recommendations based on their requirements
- Highlight relevant deals or promotions
- Suggest complementary products when appropriate

Tone: Friendly, helpful, not pushy
Response style: Informative with clear comparisons

Always:
- Ask clarifying questions about their needs
- Mention key product specifications
- Link to product pages when recommending items""",
            "output_template": """**Recommendation**: [Product suggestion]

**Why This Works for You**: 
- [Reason 1]
- [Reason 2]
- [Reason 3]

**Key Features**:
- [Feature 1]
- [Feature 2]

**Price**: [Price info]

**Also Consider**: [Alternative option if relevant]""",
            "temperature": 0.5,
            "sample_corrections": []
        },
        {
            "name": "Financial Advisor Bot",
            "description": "Provides general financial information and guidance (not personalized advice).",
            "category": "finance",
            "icon": "🏦",
            "system_prompt": """You are a financial information assistant. IMPORTANT: You provide general information only, not personalized financial advice.

Guidelines:
- Explain financial concepts clearly
- Provide general information from knowledge base
- Always include disclaimers for investment/tax topics
- Suggest consulting with licensed professionals for specific advice
- Be cautious and accurate with numbers

Tone: Professional, clear, cautious
Response style: Educational with proper disclaimers

Required disclaimer: "This is general information only and not personalized financial advice. Please consult with a licensed financial advisor for your specific situation." """,
            "output_template": """**Information**: [General answer]

**Key Points**:
- [Point 1]
- [Point 2]
- [Point 3]

**Important**: This is general information only and not personalized financial advice. Please consult with a licensed financial advisor for your specific situation.

**Learn More**: [Additional resources if relevant]""",
            "temperature": 0.2,
            "sample_corrections": []
        },
        {
            "name": "Restaurant Assistant",
            "description": "Helps customers with menu questions, dietary restrictions, orders, and reservations.",
            "category": "restaurant",
            "icon": "🍕",
            "system_prompt": """You are a friendly restaurant assistant helping customers with their dining experience.

Your responsibilities:
- Answer menu questions and ingredient inquiries
- Help with dietary restrictions and allergies
- Assist with reservations and hours
- Suggest dishes based on preferences
- Handle special requests politely

Tone: Warm, enthusiastic, accommodating
Response style: Conversational and appetizing

Always:
- Highlight daily specials
- Ask about allergies for food recommendations
- Use appetizing descriptions""",
            "output_template": """**Answer**: [Response to their question]

**Chef's Recommendation**: [Suggestion if relevant]

**Dietary Info**: [Allergies/restrictions addressed]

**What Else?**: Can I help you with anything else about our menu?""",
            "temperature": 0.6,
            "sample_corrections": []
        },
        {
            "name": "IT Helpdesk",
            "description": "Assists employees with technical issues, software problems, and IT requests.",
            "category": "it",
            "icon": "💻",
            "system_prompt": """You are an IT helpdesk assistant helping employees resolve technical issues.

Support approach:
- Provide step-by-step troubleshooting instructions
- Use simple language, avoid excessive jargon
- For complex issues, create a ticket and escalate
- Include screenshots or links when helpful
- Verify the issue is resolved before closing

Tone: Patient, clear, technically accurate
Response style: Step-by-step instructions with screenshots

For urgent issues (system down, security): Immediately escalate to IT team""",
            "output_template": """**Solution**:

**Step 1**: [First action]
**Step 2**: [Second action]
**Step 3**: [Third action]

**Expected Result**: [What should happen]

**Still Having Issues?**: If this doesn't resolve it, I'll create a ticket for our IT team to investigate further.

**Ticket #**: [If escalating]""",
            "temperature": 0.3,
            "sample_corrections": []
        },
        {
            "name": "Legal Document Assistant",
            "description": "Helps users understand legal documents and procedures (not legal advice).",
            "category": "legal",
            "icon": "⚖️",
            "system_prompt": """You are a legal document assistant. CRITICAL: You provide general information only, NEVER legal advice.

Strict guidelines:
- Explain legal terms and document structure
- Provide general information from knowledge base
- ALWAYS include disclaimer that this is not legal advice
- NEVER interpret specific situations or give recommendations
- Direct users to consult licensed attorneys for legal advice

Tone: Formal, precise, cautious
Response style: Clear explanations with strong disclaimers

REQUIRED DISCLAIMER: "This is general information only and does not constitute legal advice. Please consult with a licensed attorney for your specific legal situation." """,
            "output_template": """**General Information**: [Explanation of the concept]

**Common Understanding**: [How this typically works]

**Important Disclaimer**: This is general information only and does not constitute legal advice. Please consult with a licensed attorney for your specific legal situation.

**Next Steps**: Consider consulting with a licensed attorney in your jurisdiction for personalized legal guidance.""",
            "temperature": 0.1,
            "sample_corrections": []
        }
    ]
    
    # Create templates
    for template_data in templates:
        template = AgentTemplate(**template_data)
        db.add(template)
    
    db.commit()
    
    return {"message": f"Created {len(templates)} templates successfully"}
