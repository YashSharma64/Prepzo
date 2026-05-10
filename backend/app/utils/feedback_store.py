import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def add_feedback(entry: dict):
    # Map the dictionary to our Supabase columns
    data = {
        "student_name": entry.get("studentName", "Anonymous"),
        "subject": entry.get("subject"),
        "rating": entry.get("rating"),
        "review": entry.get("review")
    }
    supabase.table("feedback").insert(data).execute()

def get_all_feedback() -> list:
    try:
        response = supabase.table("feedback").select("*").order("created_at", desc=False).execute()
        feedbacks = []
        for row in response.data:
            feedbacks.append({
                "studentName": row.get("student_name"),
                "subject": row.get("subject"),
                "rating": row.get("rating"),
                "review": row.get("review"),
                "submittedAt": row.get("created_at")
            })
        return feedbacks
    except Exception as e:
        print("Error fetching from Supabase:", e)
        return []

def get_average_rating() -> float:
    try:
        response = supabase.table("feedback").select("rating").execute()
        data = response.data
        if not data:
            return 0.0
        return round(sum(row["rating"] for row in data) / len(data), 2)
    except Exception as e:
        print("Error fetching average rating:", e)
        return 0.0
