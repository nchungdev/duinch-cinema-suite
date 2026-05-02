import re
import unicodedata
from typing import Set

def normalize_text(text: str) -> str:
    """Normalize text for consistent comparison (remove accents, lowercase, etc.)"""
    if not text: return ""
    # Basic cleanup
    t = text.lower().replace('đ', 'd').replace('Đ', 'D')
    # Normalize unicode
    nfkd = unicodedata.normalize('NFKD', t)
    ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
    # Remove special chars but keep spaces
    return re.sub(r'[^a-z0-9\s]+', ' ', ascii_str).strip()

def get_tokens(text: str) -> Set[str]:
    """Tokenize normalized text into a set of words."""
    if not text: return set()
    return set(normalize_text(text).split())

# Tokens that are commonly used in media titles but don't change the series identity
META_TOKENS = {
    "vietsub", "long", "tieng", "thuyet", "minh", "phu", "de", "cam", "hd", "bluray", 
    "full", "raw", "re", "ux", "remux", "fhd", "4k", "uhd", "tap", "phim", "le", "bo",
    "episode", "ep", "ss", "season", "phan", "the", "a", "an", "is", "of", "and", "or",
    "vostfr", "sub", "dual", "multi", "web", "dl"
}

def check_identity_leakage(result_title: str, query_title: str, ignore_year: int = 0, ignore_season: int = 0) -> bool:
    """
    Returns True if the result_title contains significant words NOT found in query_title.
    This helps detect sequels, spinoffs, or live-action versions when only the base title is requested.
    """
    r_tokens = get_tokens(result_title)
    q_tokens = get_tokens(query_title)
    
    # Words in result but not in query
    diff = r_tokens - q_tokens - META_TOKENS
    
    # Also ignore specific numbers if they represent year or season
    if ignore_year and str(ignore_year) in diff:
        diff.remove(str(ignore_year))
    if ignore_season and str(ignore_season) in diff:
        diff.remove(str(ignore_season))
        
    # If significant tokens remain, it's likely a different series/identity
    return len(diff) > 0
