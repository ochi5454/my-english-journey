# Multi-Agent System Implementation Reference
> AI Development Assistant Optimized | Token-Efficient Format

## Quick Reference Index

```
├─ ARCH    : Architecture Patterns
├─ IMPL    : Implementation Templates
├─ AGENT   : Agent Specifications
├─ API     : API Endpoints
├─ DB      : Data Access Patterns
├─ ERROR   : Error Handling
└─ DEPLOY  : Deployment Config
```

---

## ARCH: Architecture Patterns

### Core Flow
```
User → API Gateway → Orchestrator → [Agents] → Database
                         ↓
                    Intent Router
                    /    |    \
                Data  Analysis  Notify
```

### Tech Stack
| Layer | Tech | Import |
|-------|------|--------|
| Framework | LangGraph | `from langgraph.graph import StateGraph` |
| API | FastAPI | `from fastapi import FastAPI` |
| LLM | Azure OpenAI | `from langchain_openai import AzureChatOpenAI` |
| DB | PostgreSQL + SQLAlchemy | `from sqlalchemy.ext.asyncio import AsyncSession` |

### State Schema
```python
from typing import TypedDict

class AgentState(TypedDict):
    query: str                    # User input
    intent: str                   # search|analyze|notify|report|chat
    context: dict                 # Request metadata
    intermediate_results: list    # Agent outputs
    final_response: str          # User response
    error: str | None            # Error message
```

---

## IMPL: Implementation Templates

### 1. Orchestrator Graph
```python
from langgraph.graph import StateGraph, END

# Graph setup
graph = StateGraph(AgentState)

# Add nodes
graph.add_node("classify", classify_intent_node)
graph.add_node("data", data_agent_node)
graph.add_node("analysis", analysis_agent_node)
graph.add_node("notify", notification_agent_node)
graph.add_node("report", report_agent_node)
graph.add_node("chat", chat_agent_node)
graph.add_node("synthesize", synthesize_results_node)

# Define routing
graph.set_entry_point("classify")
graph.add_conditional_edges(
    "classify",
    route_by_intent,
    {
        "search": "data",
        "analyze": "analysis",
        "notify": "notify",
        "report": "report",
        "chat": "chat"
    }
)

# Connect to synthesis
for node in ["data", "analysis", "notify", "report", "chat"]:
    graph.add_edge(node, "synthesize")
graph.add_edge("synthesize", END)

app = graph.compile()
```

### 2. Intent Classification
```python
async def classify_intent_node(state: AgentState) -> AgentState:
    """Classify user intent using LLM"""
    
    prompt = f"""Classify intent: {state['query']}
    Options: search, analyze, notify, report, chat
    Return only the intent name."""
    
    response = await llm.ainvoke(prompt)
    intent = response.content.strip().lower()
    
    return {**state, "intent": intent}

def route_by_intent(state: AgentState) -> str:
    """Route to appropriate agent"""
    return state["intent"]
```

### 3. Agent Base Pattern
```python
class BaseAgent:
    def __init__(self, db: AsyncSession, llm: AzureChatOpenAI):
        self.db = db
        self.llm = llm
    
    async def execute(self, state: AgentState) -> AgentState:
        """Override in subclass"""
        raise NotImplementedError
    
    async def _handle_error(self, error: Exception, state: AgentState) -> AgentState:
        """Standard error handling"""
        return {
            **state,
            "error": f"{self.__class__.__name__}: {str(error)}"
        }
```

---

## AGENT: Agent Specifications

### Data Agent
**Purpose**: Database queries and data retrieval

```python
class DataAgent(BaseAgent):
    async def execute(self, state: AgentState) -> AgentState:
        try:
            # Parse query to SQL parameters
            params = await self._parse_query(state["query"])
            
            # Execute query using repository
            results = await self._fetch_data(params)
            
            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {"type": "data", "data": results}
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)
    
    async def _parse_query(self, query: str) -> dict:
        """LLM converts natural language to query params"""
        prompt = f"""Extract query parameters from: {query}
        Return JSON: {{"entity": "engineer|project|qualification", "filters": {{}}}}"""
        response = await self.llm.ainvoke(prompt)
        return json.loads(response.content)
    
    async def _fetch_data(self, params: dict) -> list:
        """Execute DB query"""
        repo = self._get_repository(params["entity"])
        return await repo.find_by_filters(self.db, params["filters"])
```

**Query Mapping**:
| Natural Language | Entity | Action |
|-----------------|--------|--------|
| "Show engineers" | engineer | list_all() |
| "Java skilled" | engineer + skills | filter_by_skill() |
| "Expiring qualifications" | qualification | filter_by_expiry() |
| "Available next month" | assignment | check_availability() |

### Analysis Agent
**Purpose**: Skill matching and resource optimization

```python
class AnalysisAgent(BaseAgent):
    async def execute(self, state: AgentState) -> AgentState:
        try:
            # Extract requirements
            requirements = await self._extract_requirements(state["query"])
            
            # Find matching engineers
            matches = await self._find_matches(requirements)
            
            # Calculate scores
            scored = self._calculate_scores(matches, requirements)
            
            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {"type": "analysis", "matches": scored}
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)
    
    async def _find_matches(self, req: dict) -> list:
        """Find engineers matching requirements"""
        # 1. Skill filter
        candidates = await self._get_by_skills(req["skills"])
        
        # 2. Availability filter
        available = await self._filter_availability(
            candidates, 
            req["start_date"], 
            req["end_date"]
        )
        
        return available
    
    def _calculate_scores(self, engineers: list, req: dict) -> list:
        """Score each engineer"""
        scored = []
        for eng in engineers:
            score = (
                self._skill_match_score(eng, req["skills"]) * 0.5 +
                self._experience_score(eng) * 0.3 +
                self._availability_score(eng) * 0.2
            )
            scored.append({"engineer": eng, "score": score})
        
        return sorted(scored, key=lambda x: x["score"], reverse=True)
```

**Scoring Formula**:
```
Total Score = (Skill Match × 0.5) + (Experience × 0.3) + (Availability × 0.2)

Skill Match = matched_skills / required_skills
Experience = min(years / 5, 1.0)
Availability = 1.0 if fully_available else 0.5
```

### Notification Agent
**Purpose**: Send alerts and notifications

```python
class NotificationAgent(BaseAgent):
    async def execute(self, state: AgentState) -> AgentState:
        try:
            # Parse notification request
            notif_config = await self._parse_request(state["query"])
            
            # Create notifications
            notifications = await self._create_notifications(notif_config)
            
            # Send via appropriate channel
            results = await self._send_all(notifications)
            
            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {"type": "notification", "sent": len(results)}
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)
    
    async def _create_notifications(self, config: dict) -> list[Notification]:
        """Generate notification messages"""
        template = self.templates[config["type"]]
        recipients = await self._get_recipients(config)
        
        return [
            Notification(
                recipient=r.email,
                subject=template["subject"].format(**r.dict()),
                body=template["body"].format(**r.dict()),
                channel=config.get("channel", "email")
            )
            for r in recipients
        ]
```

**Notification Types**:
```python
NOTIFICATION_TYPES = {
    "qualification_expiry": {
        "query_filter": "expires_within_days",
        "template": "qualification_expiry_template",
        "schedule": "daily_09:00"
    },
    "assignment_change": {
        "query_filter": "recent_assignments",
        "template": "assignment_notification",
        "schedule": "immediate"
    },
    "monthly_report": {
        "query_filter": "all_active",
        "template": "monthly_summary",
        "schedule": "monthly_1st"
    }
}
```

### Report Agent
**Purpose**: Generate Excel/PDF reports

```python
class ReportAgent(BaseAgent):
    async def execute(self, state: AgentState) -> AgentState:
        try:
            # Parse report request
            report_spec = await self._parse_request(state["query"])
            
            # Fetch data
            data = await self._fetch_report_data(report_spec)
            
            # Generate file
            file_path = await self._generate_file(data, report_spec)
            
            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {"type": "report", "file_path": file_path}
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)
    
    async def _generate_file(self, data: list, spec: dict) -> str:
        """Generate Excel file"""
        from openpyxl import Workbook
        
        wb = Workbook()
        ws = wb.active
        ws.title = spec["title"]
        
        # Write headers
        ws.append(spec["columns"])
        
        # Write data
        for row in data:
            ws.append([row.get(col) for col in spec["columns"]])
        
        file_path = f"/tmp/{spec['filename']}.xlsx"
        wb.save(file_path)
        return file_path
```

**Report Templates**:
```python
REPORT_TEMPLATES = {
    "engineer_list": {
        "columns": ["ID", "Name", "Skills", "Qualifications", "Status"],
        "query": "SELECT * FROM engineers JOIN skills JOIN qualifications"
    },
    "monthly_utilization": {
        "columns": ["Engineer", "Project", "Hours", "Utilization%"],
        "query": "SELECT * FROM assignments WHERE month = ?"
    },
    "qualification_status": {
        "columns": ["Engineer", "Qualification", "Expiry Date", "Status"],
        "query": "SELECT * FROM qualifications ORDER BY expiry_date"
    }
}
```

### Chat Agent
**Purpose**: General conversation and help

```python
class ChatAgent(BaseAgent):
    SYSTEM_PROMPT = """You are a helpful assistant for the Qualification Management System.
    Capabilities:
    - Engineer management (CRUD)
    - Qualification tracking
    - Project assignment
    - Skill matching
    
    Be concise and helpful."""
    
    async def execute(self, state: AgentState) -> AgentState:
        try:
            response = await self.llm.ainvoke([
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": state["query"]}
            ])
            
            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {"type": "chat", "response": response.content}
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)
```

---

## API: Endpoints

### POST /api/agent/chat
```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/agent", tags=["agent"])

@router.post("/chat")
async def agent_chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """Natural language interface to system"""
    
    # Initialize state
    initial_state = AgentState(
        query=request.message,
        intent="",
        context=request.context or {},
        intermediate_results=[],
        final_response="",
        error=None
    )
    
    # Execute graph
    result = await app.ainvoke(initial_state)
    
    # Return response
    return ChatResponse(
        response=result["final_response"],
        data=result["intermediate_results"],
        intent=result["intent"],
        error=result["error"]
    )

# Request/Response Models
class ChatRequest(BaseModel):
    message: str
    context: dict | None = None

class ChatResponse(BaseModel):
    response: str
    data: list
    intent: str
    error: str | None
```

### Legacy API Coexistence
```python
# main.py
app = FastAPI()

# Existing REST APIs (unchanged)
app.include_router(engineers.router, prefix="/api/v1/engineers")
app.include_router(qualifications.router, prefix="/api/v1/qualifications")
app.include_router(projects.router, prefix="/api/v1/projects")
app.include_router(assignments.router, prefix="/api/v1/assignments")

# New Agent API
app.include_router(agent_chat.router, prefix="/api/agent")
```

---

## DB: Data Access Patterns

### Repository Pattern
```python
class BaseRepository:
    """Base class for data access"""
    
    @staticmethod
    async def find_by_id(db: AsyncSession, id: int):
        result = await db.execute(
            select(Model).where(Model.id == id)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def find_by_filters(db: AsyncSession, filters: dict):
        query = select(Model)
        for key, value in filters.items():
            query = query.where(getattr(Model, key) == value)
        result = await db.execute(query)
        return result.scalars().all()
    
    @staticmethod
    async def create(db: AsyncSession, data: dict):
        obj = Model(**data)
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj
```

### Skill Matching Query
```python
async def find_engineers_by_skills(
    db: AsyncSession,
    skill_names: list[str]
) -> list[Engineer]:
    """Find engineers with ALL specified skills"""
    
    query = (
        select(Engineer)
        .join(Engineer.engineer_skills)
        .join(EngineerSkill.skill)
        .where(Skill.name.in_(skill_names))
        .group_by(Engineer.id)
        .having(func.count(Skill.id) == len(skill_names))
    )
    
    result = await db.execute(query)
    return result.scalars().all()
```

### Availability Check Query
```python
async def check_availability(
    db: AsyncSession,
    engineer_id: int,
    start_date: date,
    end_date: date
) -> bool:
    """Check if engineer is available in date range"""
    
    query = (
        select(func.count(Assignment.id))
        .where(
            Assignment.engineer_id == engineer_id,
            Assignment.start_date <= end_date,
            Assignment.end_date >= start_date
        )
    )
    
    result = await db.execute(query)
    conflict_count = result.scalar()
    
    return conflict_count == 0
```

---

## ERROR: Error Handling

### Error Response Format
```python
class AgentError(Exception):
    """Base exception for agent errors"""
    def __init__(self, message: str, agent_name: str, recoverable: bool = True):
        self.message = message
        self.agent_name = agent_name
        self.recoverable = recoverable
        super().__init__(self.message)

# Usage in agent
try:
    result = await self.process()
except Exception as e:
    raise AgentError(
        message=str(e),
        agent_name=self.__class__.__name__,
        recoverable=True
    )
```

### Graceful Degradation
```python
async def synthesize_results_node(state: AgentState) -> AgentState:
    """Combine results from all agents"""
    
    successful_results = [
        r for r in state["intermediate_results"]
        if "error" not in r
    ]
    
    failed_agents = [
        r["agent"] for r in state["intermediate_results"]
        if "error" in r
    ]
    
    # Generate response with partial results
    if successful_results:
        response = generate_response(successful_results)
        if failed_agents:
            response += f"\n\nNote: {', '.join(failed_agents)} encountered errors."
    else:
        response = "All agents failed. Please try again or contact support."
    
    return {**state, "final_response": response}
```

### Retry Logic
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10)
)
async def call_llm_with_retry(prompt: str) -> str:
    """Retry LLM calls on failure"""
    response = await llm.ainvoke(prompt)
    return response.content
```

---

## DEPLOY: Deployment Configuration

### Environment Variables
```bash
# .env
# Azure OpenAI
AZURE_OPENAI_API_KEY=xxx
AZURE_OPENAI_ENDPOINT=https://xxx.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname

# LangSmith (optional monitoring)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=xxx
LANGCHAIN_PROJECT=qualification-mgmt
```

### Dependencies
```txt
# requirements.txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy==2.0.25
asyncpg==0.29.0
pydantic==2.5.3
pydantic-settings==2.1.0

# LangGraph stack
langgraph==0.1.0
langchain==0.2.0
langchain-openai==0.1.0
langchain-community==0.2.0

# Additional
openpyxl==3.1.2  # Excel generation
python-multipart==0.0.6  # File uploads
python-jose[cryptography]==3.3.0  # JWT
```

### Docker Compose
```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/qualification_mgmt
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
    depends_on:
      - db
  
  db:
    image: postgres:16
    environment:
      - POSTGRES_DB=qualification_mgmt
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Azure Container Apps
```yaml
# containerapp.yaml
properties:
  configuration:
    ingress:
      external: true
      targetPort: 8000
    secrets:
      - name: openai-key
        value: ${AZURE_OPENAI_API_KEY}
  template:
    containers:
      - name: backend
        image: your-registry.azurecr.io/backend:latest
        resources:
          cpu: 1.0
          memory: 2Gi
        env:
          - name: AZURE_OPENAI_API_KEY
            secretRef: openai-key
          - name: DATABASE_URL
            value: postgresql+asyncpg://...
```

---

## QUICK PATTERNS

### Pattern: Sequential Agent Chain
```python
# When agents must run in order
graph.add_edge("agent1", "agent2")
graph.add_edge("agent2", "agent3")
graph.add_edge("agent3", END)
```

### Pattern: Parallel Agent Execution
```python
# When agents can run simultaneously
graph.add_conditional_edges("orchestrator", route, {
    "path1": ["agent1", "agent2"],
    "path2": ["agent3", "agent4"]
})
```

### Pattern: Agent Retry with Fallback
```python
def agent_with_fallback(state: AgentState) -> AgentState:
    try:
        return primary_agent.execute(state)
    except AgentError as e:
        if e.recoverable:
            return fallback_agent.execute(state)
        raise
```

### Pattern: Conditional Agent Selection
```python
def smart_router(state: AgentState) -> str:
    # Complex routing logic
    if needs_analysis(state):
        if has_historical_data(state):
            return "ml_agent"
        return "rule_based_agent"
    return "simple_agent"
```

---

## PERFORMANCE TIPS

1. **Cache LLM responses** for repeated queries
   ```python
   from functools import lru_cache
   
   @lru_cache(maxsize=100)
   def classify_cached(query: str) -> str:
       return classify_intent(query)
   ```

2. **Batch database queries**
   ```python
   # Bad: N queries
   for id in ids:
       await get_by_id(id)
   
   # Good: 1 query
   await get_by_ids(ids)
   ```

3. **Stream responses** for long operations
   ```python
   async def stream_response():
       async for chunk in agent.stream():
           yield f"data: {chunk}\n\n"
   ```

4. **Limit token usage**
   ```python
   # Truncate long inputs
   MAX_TOKENS = 2000
   truncated_query = query[:MAX_TOKENS]
   ```

---

## MONITORING

### LangSmith Integration
```python
from langsmith import traceable

@traceable(name="orchestrator")
async def orchestrator_node(state: AgentState) -> AgentState:
    # Automatically traced in LangSmith
    return await process(state)
```

### Custom Metrics
```python
from prometheus_client import Counter, Histogram

agent_calls = Counter('agent_calls_total', 'Total agent calls', ['agent_name', 'status'])
agent_duration = Histogram('agent_duration_seconds', 'Agent execution time', ['agent_name'])

# Usage
with agent_duration.labels(agent_name="data").time():
    result = await data_agent.execute(state)
agent_calls.labels(agent_name="data", status="success").inc()
```

---

## TESTING

### Unit Test Template
```python
import pytest
from unittest.mock import AsyncMock

@pytest.mark.asyncio
async def test_data_agent():
    # Setup
    mock_db = AsyncMock()
    mock_llm = AsyncMock()
    agent = DataAgent(mock_db, mock_llm)
    
    state = AgentState(
        query="Show engineers",
        intent="search",
        context={},
        intermediate_results=[],
        final_response="",
        error=None
    )
    
    # Execute
    result = await agent.execute(state)
    
    # Assert
    assert result["error"] is None
    assert len(result["intermediate_results"]) > 0
```

### Integration Test
```python
@pytest.mark.asyncio
async def test_full_workflow():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post(
            "/api/agent/chat",
            json={"message": "Find Java engineers"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert data["intent"] == "analyze"
    assert len(data["data"]) > 0
```

---

## REFERENCE CHECKLIST

### Implementation Phases
- [ ] Phase 1: Orchestrator + Chat Agent (2 weeks)
- [ ] Phase 2: Data Agent + Intent Classification (2 weeks)
- [ ] Phase 3: Analysis Agent (2 weeks)
- [ ] Phase 4: Notification Agent (2 weeks)
- [ ] Phase 5: Report Agent (1 week)

### Code Review Points
- [ ] Error handling in all agents
- [ ] State type correctness
- [ ] Database connection management
- [ ] LLM token usage optimization
- [ ] Test coverage > 80%
- [ ] Logging for debugging
- [ ] Security: Input validation
- [ ] Performance: Query optimization

### Deployment Checklist
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Azure OpenAI endpoint tested
- [ ] LangSmith monitoring enabled
- [ ] Health check endpoint working
- [ ] CORS configured for frontend
- [ ] Rate limiting implemented
- [ ] Backup strategy in place

---

**End of Reference** | Version 1.0 | 2026-01-31
