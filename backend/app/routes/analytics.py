from fastapi import APIRouter
from app.utils.store import analytics_data, record_event
from app.utils.feedback_store import supabase
from collections import Counter

router = APIRouter()

@router.get("/analytics")
async def get_analytics():
    """
    Returns platform analytics.
    """
    try:
        # Get users count
        users_resp = supabase.table("users").select("id", count="exact").execute()
        users_count = users_resp.count if users_resp.count is not None else 0

        # Get plans
        plans_resp = supabase.table("plans").select("subject, mode", count="exact").execute()
        plans_data = plans_resp.data
        plans_count = plans_resp.count if plans_resp.count is not None else len(plans_data)

        # Aggregate modes and subjects
        mode_breakdown = {"survival": 0, "balanced": 0, "full": 0}
        subjects = []
        for plan in plans_data:
            mode = plan.get("mode", "")
            if mode in mode_breakdown:
                mode_breakdown[mode] += 1
            elif mode:
                mode_breakdown[mode] = mode_breakdown.get(mode, 0) + 1
            
            subject = plan.get("subject")
            if subject:
                subjects.append(subject.capitalize())

        top_subjects_counter = Counter(subjects)
        top_subjects = dict(top_subjects_counter)

        return {
            "totalPlansGenerated": plans_count,
            "topSubjects": top_subjects,
            "modeBreakdown": mode_breakdown,
            "users_count": users_count,
            "avg_q_per_user": analytics_data.get("avg_q_per_user", 0),
            "chat_msgs": analytics_data.get("chat_msgs", 0)
        }

    except Exception as e:
        print("Error fetching analytics from Supabase:", e)
        return analytics_data

@router.post("/analytics/track")
async def track_event(event_type: str):
    """
    Tracks an event (e.g., plan_generated, chat_msg_sent).
    """
    record_event(event_type)
    return {"status": "success", "event": event_type}
