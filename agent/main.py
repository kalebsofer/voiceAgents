import json
import logging
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, AutoSubscribe, JobContext, WorkerOptions, cli, llm
from livekit.plugins import openai

load_dotenv()

logger = logging.getLogger("voice-agent")

MEMORY_FILE = Path(__file__).parent / "memory.json"


def load_memory() -> dict[str, str]:
    if MEMORY_FILE.exists():
        return json.loads(MEMORY_FILE.read_text())
    return {}


def save_memory(memory: dict[str, str]) -> None:
    MEMORY_FILE.write_text(json.dumps(memory, indent=2))


class VoiceAgent(Agent):
    _extra_context: str = ""

    def __init__(self):
        super().__init__(
            instructions=(
                "You are a drunk pirate who is also a licensed therapist. "
                "You slur your words, say 'arrr' often, and reference the sea and sailing metaphors, "
                "but you genuinely care about the user's mental health and give surprisingly insightful advice. "
                "Mix pirate slang with therapeutic language. Keep responses concise since this is a voice conversation.\n\n"
                "You have a memory tool. Use it to remember important things the user tells you "
                "(their name, what they're going through, breakthroughs, etc.) and recall them in future sessions. "
                "Proactively save things that seem important without being asked.\n\n"
                "When the conversation starts, greet the user as a drunk pirate therapist would."
            ),
        )

    @llm.function_tool(description="Save a note to memory with a key and value. Use this to remember important things about the user.")
    async def save_note(self, key: str, value: str) -> str:
        memory = load_memory()
        memory[key] = value
        save_memory(memory)
        logger.info(f"Saved memory: {key} = {value}")
        return f"Saved '{key}' to memory."

    @llm.function_tool(description="Recall a note from memory by key. Returns the value if found.")
    async def recall_note(self, key: str) -> str:
        memory = load_memory()
        if key in memory:
            return f"{key}: {memory[key]}"
        return f"No memory found for '{key}'."

    @llm.function_tool(description="List all saved memory keys and values.")
    async def list_memories(self) -> str:
        memory = load_memory()
        if not memory:
            return "No memories saved yet."
        return "\n".join(f"{k}: {v}" for k, v in memory.items())


async def entrypoint(ctx: JobContext):
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    participant = await ctx.wait_for_participant()
    logger.info(f"Participant joined: {participant.identity}")

    model = openai.realtime.RealtimeModel(
        voice="shimmer",
        modalities=["audio", "text"],
    )

    session = AgentSession(llm=model)

    # Load existing memories so the agent can reference them
    memory = load_memory()
    agent = VoiceAgent()
    if memory:
        memory_summary = ", ".join(f"{k}: {v}" for k, v in memory.items())
        agent._extra_context = (
            f"\n\nYou remember these things about the user: {memory_summary}. "
            "Reference them naturally in your greeting."
        )

    await session.start(agent, room=ctx.room)
    await session.generate_reply()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
