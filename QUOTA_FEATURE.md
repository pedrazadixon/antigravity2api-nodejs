# Model Quota Management Feature

## Feature Overview

Added model quota viewing functionality that allows you to check the remaining quota and reset time for each model corresponding to a Token in the frontend management interface.

## Implementation Plan

### Data Storage
- **accounts.json**: Kept simple, stores only core authentication information
- **data/quotas.json**: New file specifically for storing quota information (lightweight persistence)
- **Memory Cache**: 5-minute cache to avoid frequent API requests
- **Auto Cleanup**: Hourly cleanup of data not updated for over 1 hour

### Core Files

1. **src/api/client.js**
   - New `getModelsWithQuotas(token)` function
   - Extract `quotaInfo` field from API response
   - Return simplified quota data structure

2. **src/auth/quota_manager.js** (New)
   - Quota cache management
   - File persistence
   - UTC time to Beijing time conversion
   - Auto cleanup of expired data

3. **src/routes/admin.js**
   - New `GET /admin/tokens/:refreshToken/quotas` endpoint
   - Support on-demand retrieval of quota information for specified Token

4. **public/app.js**
   - New `toggleQuota()` function: expand/collapse quota panel
   - New `loadQuota()` function: load quota data from API
   - New `renderQuota()` function: render progress bars and quota information

5. **public/style.css**
   - New quota display related styles
   - Progress bar styles (supports color gradient: green>50%, yellow 20-50%, red<20%)

## Usage Instructions

### Frontend Operations

1. Login to the management interface
2. Click the **"📊 View Quota"** button in the Token card
3. The system will automatically load all model quota information for that Token
4. Display in progress bar format:
   - Model name
   - Remaining quota percentage (with color coding)
   - Quota reset time (Beijing time)

### Data Format

#### API Response Example
```json
{
  "success": true,
  "data": {
    "lastUpdated": 1765109350660,
    "models": {
      "gemini-2.0-flash-exp": {
        "remaining": 0.972,
        "resetTime": "01-07 15:27",
        "resetTimeRaw": "2025-01-07T07:27:44Z"
      },
      "gemini-1.5-pro": {
        "remaining": 0.85,
        "resetTime": "01-07 16:15",
        "resetTimeRaw": "2025-01-07T08:15:30Z"
      }
    }
  }
}
```

#### quotas.json Storage Format
```json
{
  "meta": {
    "lastCleanup": 1765109350660,
    "ttl": 3600000
  },
  "quotas": {
    "1//0eDtvmkC_KgZv": {
      "lastUpdated": 1765109350660,
      "models": {
        "gemini-2.0-flash-exp": {
          "r": 0.972,
          "t": "2025-01-07T07:27:44Z"
        }
      }
    }
  }
}
```

## Features

✅ **On-Demand Loading**: Fetch quota information only when user clicks  
✅ **Smart Caching**: Use cache for repeated views within 5 minutes, reducing API requests  
✅ **Auto Cleanup**: Regularly clean up expired data to keep files lightweight  
✅ **Visual Display**: Progress bars intuitively show remaining quota  
✅ **Color Coding**: Green (>50%), Yellow (20-50%), Red (<20%)  
✅ **Time Conversion**: Auto-convert UTC time to Beijing time  
✅ **Lightweight Storage**: Use field abbreviations, store only changed models  

## Notes

1. First quota view requires calling Google API, may take a few seconds
2. Quota information is cached for 5 minutes; wait for cache expiration to view latest data
3. quotas.json file is created automatically, no manual configuration needed
4. Expired or invalid Tokens will display error messages

## Testing

After starting the service:
```bash
npm start
```

Access the management interface and click the "View Quota" button on any Token to test the feature.
