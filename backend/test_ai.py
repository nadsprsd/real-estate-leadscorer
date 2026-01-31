

from services.ai_engine import analyze_lead_message



msg = """
Hi, I'm relocating to Bangalore next week for my new job.
Budget is around 70k. Need urgent help.

"""

result = analyze_lead_message(msg)

print(result)

