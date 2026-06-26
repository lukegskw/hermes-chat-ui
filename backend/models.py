from pydantic import BaseModel, Field
from typing import List, Optional, Any, Union

class ContentPart(BaseModel):
    type: str
    text: Optional[str] = None
    image_url: Optional[dict] = None

class Message(BaseModel):
    id: str
    role: str
    content: Union[str, List[dict]]
    reasoning_content: Optional[str] = None
    tool_calls: Optional[List[dict]] = None
    timestamp: Optional[str] = None

class Conversation(BaseModel):
    id: str
    title: str
    model_id: Optional[str] = None
    messages: List[Message]
    updated_at: Optional[str] = None
