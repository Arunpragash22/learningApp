# src/services/zoom_service.py
import os
from datetime import datetime
import httpx
from typing import List, Dict, Optional

ZOOM_ACCOUNT_ID = os.getenv("ZOOM_ACCOUNT_ID")
ZOOM_CLIENT_ID = os.getenv("ZOOM_CLIENT_ID")
ZOOM_CLIENT_SECRET = os.getenv("ZOOM_CLIENT_SECRET")


class ZoomServiceError(Exception):
    pass


async def get_zoom_access_token() -> str:
    if not (ZOOM_ACCOUNT_ID and ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET):
        raise ZoomServiceError("Zoom credentials are not set in environment variables")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://zoom.us/oauth/token",
            params={
                "grant_type": "account_credentials",
                "account_id": ZOOM_ACCOUNT_ID,
            },
            auth=(ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET),
        )
        if resp.status_code != 200:
            raise ZoomServiceError(f"Failed to get Zoom token: {resp.text}")

        data = resp.json()
        return data["access_token"]


async def list_zoom_meetings(
    page_size: int = 30,
    page_number: int = 1,
    type: str = "scheduled"  # scheduled, live, upcoming
) -> List[Dict]:
    """
    List Zoom meetings for the authenticated user.
    Returns list of meetings with their details.
    """
    token = await get_zoom_access_token()
    
    params = {
        "page_size": page_size,
        "page_number": page_number,
        "type": type  # scheduled, live, upcoming
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.zoom.us/v2/users/me/meetings",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            params=params,
        )
        
        if resp.status_code != 200:
            raise ZoomServiceError(f"Failed to list Zoom meetings: {resp.text}")
        
        data = resp.json()
        return data.get("meetings", [])


async def get_zoom_meeting(meeting_id: str) -> Optional[Dict]:
    """
    Get details of a specific Zoom meeting by ID.
    """
    token = await get_zoom_access_token()
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.zoom.us/v2/meetings/{meeting_id}",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        
        if resp.status_code == 404:
            return None
        if resp.status_code != 200:
            raise ZoomServiceError(f"Failed to get Zoom meeting: {resp.text}")
        
        return resp.json()


async def create_zoom_meeting(
    topic: str,
    start_time_iso: str,
    duration_minutes: int,
    timezone: str = "Asia/Colombo",
):
    """
    Create a Zoom meeting and return join + start URLs.
    start_time_iso must be ISO8601 (e.g. 2025-11-25T10:00:00).
    """
    token = await get_zoom_access_token()

    payload = {
        "topic": topic,
        "type": 2,  # scheduled meeting
        "start_time": start_time_iso,
        "duration": duration_minutes,
        "timezone": timezone,
        "settings": {
            "join_before_host": False,
            "waiting_room": True,
            "mute_upon_entry": True,
        },
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.zoom.us/v2/users/me/meetings",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

        if resp.status_code not in (200, 201):
            raise ZoomServiceError(f"Failed to create Zoom meeting: {resp.text}")

        data = resp.json()
        return {
            "meeting_id": data["id"],
            "join_url": data["join_url"],
            "start_url": data["start_url"],
        }
