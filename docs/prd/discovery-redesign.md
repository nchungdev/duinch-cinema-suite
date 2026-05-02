# PRD: Discovery Navigation Redesign

## Problem Statement
The current "Movies" and "Series" tabs are too generic and redundant when compared to the "Recommended" tab. Users find it boring to browse a single flat list and desire more "interesting" and curated categories that allow for deeper exploration of both films and television shows within the same thematic context.

## Solution
Replace the existing top-level navigation with four curated discovery categories. Every category will adopt the "2-sub-tab" layout (Movies vs. TV Shows) to ensure a consistent browsing experience.

**New Categories:**
1. **Trending**: Media that is hot right now (Daily trending).
2. **Popular**: All-time popularity leaders.
3. **Top Rated**: Critically acclaimed masterpieces.
4. **New Release**: Recent theatrical releases (Movies) and currently airing shows (TV).

## User Stories
1. As a movie buff, I want to see "Top Rated" movies specifically, so that I can find high-quality classics I might have missed.
2. As a TV show fan, I want to see "New Release" series, so that I can keep up with the latest episodes airing this week.
3. As a user, I want the same sub-tab interface across all categories, so that the application feels intuitive and easy to use.
4. As a user, I want the "Movies" and "Series" tabs removed from the main bar to reduce clutter and focus on curated lists.
5. As a user, I want to see "Trending" content for today, so that I can stay up to date with global culture.
6. As a developer, I want a standardized backend query system for all categories, so that adding new discovery lists in the future is simple.

## Implementation Decisions
- **Frontend Navigation**: Modify the `CATEGORIES` constant in `App.tsx` to include the new IDs: `trending`, `popular`, `top_rated`, `releases`.
- **Frontend Sub-Tabs**: Update the logic in `App.tsx` (the section currently handling `category === 'new'`) to apply to ALL categories.
- **Backend API Integration**: 
  - `GET /api/trending`: Stays as is, serves the "Trending" tab.
  - `GET /api/movies?category=...`: Will support `popular`, `top_rated`, `now_playing`.
  - `GET /api/tvs?category=...`: Will support `popular`, `top_rated`, `on_the_air`.
- **Theme Consistency**: Maintain the "Arctic White" selection styles for the sub-tabs across all views.
- **State Management**: The `mediaType` state (movie/tv) will persist when switching between top-level curated categories for a smoother experience.

## Testing Decisions
- **Integration Tests**: Verify that clicking "TV Shows" in the "Top Rated" category correctly calls `/api/tvs?category=top_rated`.
- **UI Tests**: Ensure the blue underline/highlight correctly follows the active sub-tab for all four categories.
- **Data Integrity**: Verify that no duplicate items appear when scrolling (infinite scroll validation).

## Out of Scope
- Search functionality changes (remains in its own dedicated view).
- Genre-specific filtering beyond the top-level categories (e.g., "Top Rated Action").
- Personalized recommendations based on user history (remains generic TMDB-based for now).

## Further Notes
- This change aligns with the "DUINCH Cinema Engine" branding by providing a more "cinematic" discovery flow.
- Legacy slugs like `phim-le` or `phim-bo` will be completely removed as part of this overhaul.
