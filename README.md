# Antigravity to OpenAI API Proxy Service

A proxy service that converts Google Antigravity API to an OpenAI-compatible format, supporting streaming responses, tool calls, and multi-account management.

## Features

- ✅ OpenAI API Compatible Format
- ✅ Streaming and Non-streaming Responses
- ✅ Structured JSON Output Support (response_format)
- ✅ Tool Calling (Function Calling) Support
- ✅ Multi-account Automatic Rotation (supports multiple rotation strategies)
- ✅ Auto Token Refresh
- ✅ API Key Authentication
- ✅ Chain of Thought (Thinking) Output, compatible with OpenAI `reasoning_effort` parameter and DeepSeek `reasoning_content` format
- ✅ Image Input Support (Base64 encoding)
- ✅ Image Generation Support (gemini-3-pro-image model)
- ✅ Pro Account Random ProjectId Support
- ✅ Model Quota Viewing (Real-time display of remaining quota and reset time)
- ✅ SD WebUI API Compatible (supports txt2img/img2img)
- ✅ Heartbeat Mechanism (Prevents Cloudflare timeout disconnections)
- ✅ Model List Caching (Reduces API requests)
- ✅ Eligibility Verification Auto Fallback (Automatically generates random ProjectId if no eligibility)
- ✅ True System Message Merging (Merges consecutive system messages at the beginning with SystemInstruction)
- ✅ Privacy Mode (Automatically hides sensitive information)
- ✅ Memory Optimization (Reduced from 8+ processes to 2, memory usage from 100MB+ to 50MB+)
- ✅ Object Pool Reuse (Reduces 50%+ temporary object creation, lowering GC frequency)
- ✅ Signature Pass-through Control (Configurable thoughtSignature pass-through to client)
- ✅ Pre-compiled Binaries (Supports Windows/Linux/Android, no Node.js environment required)
- ✅ Multi-API Format Support (OpenAI, Gemini, Claude three formats)
- ✅ Converter Code Reuse (Common module extraction, reducing duplicate code)
- ✅ Dynamic Memory Threshold (Automatically calculates thresholds based on user configuration)

## Environment Requirements

- Node.js >= 18.0.0

## Quick Start

### Method 1: One-Click Deployment Script (Recommended)

**Windows (cmd.exe)**:
```bash
curl -O https://raw.githubusercontent.com/liuw1535/antigravity2api-nodejs/main/setup.bat && setup.bat
```

**Windows (PowerShell)**:
```powershell
IwR -Uri https://raw.githubusercontent.com/liuw1535/antigravity2api-nodejs/main/setup.bat -OutFile setup.bat; .\setup.bat
```

**Linux/macOS**:
```bash
wget https://raw.githubusercontent.com/liuw1535/antigravity2api-nodejs/main/setup.sh && chmod +x setup.sh && ./setup.sh
```

Or using curl:
```bash
curl -O https://raw.githubusercontent.com/liuw1535/antigravity2api-nodejs/main/setup.sh && chmod +x setup.sh && ./setup.sh
```

The script will automatically perform the following operations:
1. Clone the project repository
2. Install dependencies
3. Copy configuration files
4. Configure admin credentials (interactive input)
5. Start the service

### Quick Start (Already Deployed)

If you have already deployed successfully, you can use the start script to quickly launch the service:

**Windows**:
```bash
start.bat
```

**Linux/macOS**:
```bash
chmod +x start.sh
./start.sh
```

### Update Project

Use the update script to safely update to the latest version (automatically saves local changes):

**Windows**:
```bash
update.bat
```

**Linux/macOS**:
```bash
chmod +x update.sh
./update.sh
```

After updating, you can choose to:
- Restore local changes: `git stash pop`
- delete local changes: `git stash drop`

### Method 2: Manual Deployment

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Configure Environment Variables

On the first startup, if `.env` and `config.json` do not exist, the system will automatically create default configuration files.

You can also manually copy the example files:

```bash
cp .env.example .env
cp config.json.example config.json
```

Edit the `.env` file to configure necessary parameters:

```env
# Required Configuration (Leave empty to auto-generate random credentials)
API_KEY=sk-text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
JWT_SECRET=your-jwt-secret-key-change-this-in-production

# Optional Configuration
# PROXY=http://127.0.0.1:7890
# SYSTEM_INSTRUCTION=You are a chat robot
# IMAGE_BASE_URL=http://your-domain.com
```

#### 3. Login to Get Token

```bash
npm run login
```

The browser will automatically open the Google authorization page. After authorization, the Token will be saved to `data/accounts.json`.

#### 4. Start Service

```bash
npm start
```

The service will start at `http://localhost:8045`.

## Binary File Deployment (Recommended)

No Node.js installation required, simply download the pre-compiled binary file to run.

### Download Binary File

Download the binary file for your platform from [GitHub Releases](https://github.com/ZhaoShanGeng/antigravity2api-nodejs/releases):

| Platform | Filename |
|------|--------|
| Windows x64 | `antigravity2api-win-x64.exe` |
| Linux x64 | `antigravity2api-linux-x64` |
| Linux ARM64 | `antigravity2api-linux-arm64` |
| macOS x64 | `antigravity2api-macos-x64` |
| macOS ARM64 | `antigravity2api-macos-arm64` |

### Prepare Configuration Files

Place the following files in the same directory as the binary file:

```
├── antigravity2api-win-x64.exe  # Binary file
├── .env                          # Environment variable configuration (optional, auto-created on first run)
├── config.json.example           # Configuration example file (required)
├── public/                       # Static file directory (required)
│   ├── index.html
│   ├── style.css
│   ├── assets/
│   │   └── bg.jpg
│   └── js/
│       ├── auth.js
│       ├── config.js
│       ├── main.js
│       ├── quota.js
│       ├── tokens.js
│       ├── ui.js
│       └── utils.js
└── data/                         # Data directory (auto-created)
    └── accounts.json
```

### Configure Environment Variables

Create `.env` file:

```env
API_KEY=sk-your-api-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
JWT_SECRET=your-jwt-secret-key-change-this-in-production
# IMAGE_BASE_URL=http://your-domain.com
# PROXY=http://127.0.0.1:7890
```

### Run

**Windows**:
```bash
# Double-click to run, or execute in command line
antigravity2api-win-x64.exe
```

**Linux/macOS**:
```bash
# Add execution permission
chmod +x antigravity2api-linux-x64

# Run
./antigravity2api-linux-x64
```

### Binary Deployment Notes

- **No Node.js Needed**: The binary file includes the Node.js runtime.
- **Auto Configuration**: Automatically creates `config.json` from `config.json.example` on first start.
- **Configuration File**: `config.json.example` must be in the same directory as the binary file.
- **Static Files**: `public/` directory must be in the same directory as the binary file.
- **Data Persistence**: `data/` directory will be automatically created to store Token data.
- **Cross-Platform**: Supports Windows, Linux, macOS (x64 and ARM64).

### Run as System Service (Linux)

Create systemd service file `/etc/systemd/system/antigravity2api.service`:

```ini
[Unit]
Description=Antigravity2API Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/antigravity2api
ExecStart=/opt/antigravity2api/antigravity2api-linux-x64
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Start service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable antigravity2api
sudo systemctl start antigravity2api
```

## Docker Deployment

### Using Docker Compose (Recommended)

1. **One-Click Build**

```bash
npm run docker:build
```

This command will automatically:
- Create `.env` from `.env.example` (if not exists)
- Create `config.json` from `config.json.example` (if not exists)
- Create necessary directories (`data/`, `public/images/`)
- Execute `docker-compose build` to build the image

2. **Start Service**

```bash
docker compose up -d
```

3. **View Logs**

```bash
docker compose logs -f
```

4. **Stop Service**

```bash
docker compose down
```

### Manual Build

If you need to build manually, please prepare configuration files first:

```bash
# Copy configuration files
cp .env.example .env
cp config.json.example config.json

# Create necessary directories
mkdir -p data public/images

# Build image
docker build -t antigravity2api .
```

2. **Run Container**

```bash
docker run -d \
  --name antigravity2api \
  -p 8045:8045 \
  -e API_KEY=sk-text \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=admin123 \
  -e JWT_SECRET=your-jwt-secret-key \
  -e IMAGE_BASE_URL=http://your-domain.com \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/public/images:/app/public/images \
  -v $(pwd)/.env:/app/.env \
  -v $(pwd)/config.json:/app/config.json \
  antigravity2api
```

3. **View Logs**

```bash
docker logs -f antigravity2api
```

### Docker Deployment Notes

- Data Persistence: `data/` directory is mounted to the container to save Token data.
- Image Storage: `public/images/` directory is mounted to the container to save generated images.
- Configuration Files: `.env` and `config.json` are mounted to the container, supporting hot updates.
- Port Mapping: Maps port 8045 by default, can be modified as needed.
- Auto Restart: The container will restart automatically if it exits unexpectedly.

## Zeabur Deployment

### Deploy Using Pre-built Image

1. **Create Service**

Create a new service in the Zeabur console using the following image:

```
ghcr.io/liuw1535/antigravity2api-nodejs
```

2. **Configure Environment Variables**

Add the following environment variables in the service settings:

| Environment Variable | Description | Example Value |
|--------|------|--------|
| `API_KEY` | API Authentication Key | `sk-your-api-key` |
| `ADMIN_USERNAME` | Admin Username | `admin` |
| `ADMIN_PASSWORD` | Admin Password | `your-secure-password` |
| `JWT_SECRET` | JWT Secret | `your-jwt-secret-key` |
| `IMAGE_BASE_URL` | Image Service Base URL | `https://your-domain.zeabur.app` |

Optional Environment Variables:
- `PROXY`: Proxy address
- `SYSTEM_INSTRUCTION`: System prompt

3. **Configure Persistent Storage**

Add the following mount points in the service's "Volumes" settings:

| Mount Path | Description |
|---------|------|
| `/app/data` | Token Data Storage |
| `/app/public/images` | Generated Image Storage |

⚠️ **Important Note**:
- Only mount `/app/data` and `/app/public/images` directories.
- Do NOT mount other directories (like `/app/.env`, `/app/config.json` etc.), otherwise necessary configuration files will be cleared and the project will fail to start.

4. **Bind Domain**

Bind a domain in the "Networking" settings of the service, then set that domain to the `IMAGE_BASE_URL` environment variable.

5. **Start Service**

After saving the configuration, Zeabur will automatically pull the image and start the service. Access the bound domain to use.

### Zeabur Deployment Notes

- Uses pre-built Docker image, no need to build manually.
- Configure all necessary parameters via environment variables.
- Persistent storage ensures Token and image data are not lost.

## Web Management Interface

After the service starts, access `http://localhost:8045` to open the Web management interface.

### Features

- 🔐 **Secure Login**: JWT Token authentication protecting administrative interfaces.
- 📊 **Real-time Statistics**: Displays total Token count, enabled/disabled status statistics.
- ➕ **Multiple Adding Methods**:
  - OAuth Authorization Login (Recommended): Automatically completes Google authorization flow.
  - Manual Entry: Directly input Access Token and Refresh Token.
- 🎯 **Token Management**:
  - View detailed info of all Tokens (Access Token suffix, Project ID, expiration time).
  - 📊 View model quotas: Grouped by type (Claude/Gemini/Other), real-time display of remaining quota and reset time.
  - One-click Enable/Disable Token.
  - Delete invalid Tokens.
  - Real-time Refresh Token list.
- ⚙️ **Configuration Management**:
  - Online editing of server configuration (port, listening address).
  - Adjust default parameters (temperature, Top P/K, max Tokens).
  - Modify security configuration (API Key, request size limit).
  - Configure proxy, system prompt, and other options.
  - Hot reload configuration (some configurations require restart to take effect).

### Usage Flow

1. **Login to System**
   - Login using `ADMIN_USERNAME` and `ADMIN_PASSWORD` configured in `.env`.
   - JWT Token will be automatically saved to the browser after successful login.

2. **Add Token**
   - **OAuth Method** (Recommended):
     1. Click "OAuth Login" button.
     2. Click "Open Authorization Page" in the popup.
     3. Complete Google authorization in the new window.
     4. Copy the full callback URL from the browser address bar.
     5. Paste into the input box and submit.
   - **Manual Method**:
     1. Click "Manual Entry" button.
     2. Fill in Access Token, Refresh Token, and expiration time.
     3. Submit to save.

3. **Manage Tokens**
   - View status and info displayed on Token cards.
   - Click "📊 View Quota" button to see model quota info for that account.
     - Automatically grouped by model type (Claude/Gemini/Other).
     - Displays remaining quota percentage and progress bar.
     - Displays quota reset time (Beijing Time).
     - Support "Refresh Now" force update quota data.
   - Use "enable/disable" toggle to control Token status.
   - Use "Delete" button to remove invalid Tokens.
   - Click "Refresh" button to update the list.

4. **Privacy Mode**
   - Enabled by default, automatically hides sensitive info like Token, Project ID.
   - Click "Show Sensitive Info" to toggle display/hide status.
   - Support individual viewing or batch display.

5. **Configure Rotation Strategy**
   - Supports three rotation strategies:
     - `round_robin`: Load balancing, switches Token after every request.
     - `quota_exhausted`: Switches only when quota is exhausted.
     - `request_count`: Switches after custom request count.
   - Configurable in "Settings" page.

6. **Modify Configuration**
   - Switch to "Settings" tab.
   - Modify configuration items as needed.
   - Click "Save Configuration" button to apply changes.
   - Note: Port and listening address changes require service restart.
   - Supported settings:
     - Edit Token Info (Access Token, Refresh Token)
     - Thinking Budget (1024-32000)
     - Image Access URL
     - Rotation Strategy
     - Memory Threshold
     - Heartbeat Interval
     - Font Size

### Interface Preview

- **Token Management Page**: Card-style display of all Tokens, supporting quick operations.
- **Settings Page**: Categorized display of all configuration items, supporting online editing.
- **Responsive Design**: Supports desktop and mobile device access.
- **Font Optimization**: Uses MiSans + Ubuntu Mono fonts, enhancing readability.

## API Usage

The service provides OpenAI-compatible API interfaces. For detailed usage instructions, please check [API.md](API.md).

### Quick Test

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Multi-Account Management

`data/accounts.json` supports multiple accounts, and the service will automatically rotate usage:

```json
[
  {
    "access_token": "ya29.xxx",
    "refresh_token": "1//xxx",
    "expires_in": 3599,
    "timestamp": 1234567890000,
    "enable": true
  },
  {
    "access_token": "ya29.yyy",
    "refresh_token": "1//yyy",
    "expires_in": 3599,
    "timestamp": 1234567890000,
    "enable": true
  }
]
```

- `enable: false` can disable an account.
- Token will automatically refresh upon expiration.
- If refresh fails (403), it will automatically disable and switch to the next account.

## Configuration Explanation
 
 The project configuration is divided into two parts:
 
 ### 1. config.json (Basic Configuration)
 
 Basic configuration file containing server, API, and default parameter settings.
 
 On the first startup, if `config.json` does not exist, the system will automatically copy a default configuration from `config.json.example`.
 
 Configuration example:
 
 ```json
 {
   "server": {
     "port": 8045,              // Service port
     "host": "0.0.0.0",         // Listening address
     "maxRequestSize": "500mb", // Max request body size
     "heartbeatInterval": 15000,// Heartbeat interval (ms), prevents Cloudflare timeout
     "memoryThreshold": 100     // Memory threshold (MB), triggers GC when exceeded
   },
   "rotation": {
     "strategy": "round_robin", // Rotation strategy: round_robin/quota_exhausted/request_count
     "requestCount": 50         // Request count per Token under request_count strategy
   },
   "defaults": {
     "temperature": 1,          // Default temperature
     "topP": 1,                 // Default top_p
     "topK": 50,                // Default top_k
     "maxTokens": 32000,        // Default max tokens
     "thinkingBudget": 1024     // Default thinking budget (only for thinking models, range 1024-32000)
   },
   "cache": {
     "modelListTTL": 3600000    // Model list cache time (ms), default 1 hour
   },
   "other": {
     "timeout": 300000,         // Request timeout (ms)
     "skipProjectIdFetch": false,// Skip ProjectId fetching, generate directly (Pro accounts only)
     "useNativeAxios": false,   // Use native axios instead of AntigravityRequester
     "useContextSystemPrompt": false, // Merge system message in request into SystemInstruction
     "passSignatureToClient": false   // Pass thoughtSignature to client
   }
 }
 ```
 
 ### Rotation Strategy Explanation
 
 | Strategy | Description |
 |------|------|
 | `round_robin` | Load balancing: Switch to next Token after every request |
 | `quota_exhausted` | Switch only when quota exhausted: Continue using current Token until quota used up (High performance) |
 | `request_count` | Custom count: Switch after using Token for specified number of times (Default strategy) |
 
 ### 2. .env (Sensitive Configuration)
 
 Environment variable configuration file, containing sensitive info and optional settings:
 
 | Environment Variable | Description | Required |
 |--------|------|------|
 | `API_KEY` | API Authentication Key | ✅ |
 | `ADMIN_USERNAME` | Admin Username | ✅ |
 | `ADMIN_PASSWORD` | Admin Password | ✅ |
 | `JWT_SECRET` | JWT Secret | ✅ |
 | `PROXY` | Proxy address (e.g., http://127.0.0.1:7890), also supports system proxy environment variables `HTTP_PROXY`/`HTTPS_PROXY` | ❌ |
 | `SYSTEM_INSTRUCTION` | System Prompt | ❌ |
 | `IMAGE_BASE_URL` | Image Service Base URL | ❌ |
 
 Please refer to `.env.example` file for complete configuration examples.
 
 ## Development Commands
 
 ```bash
 # Start Service
 npm start
 
 # Development Mode (Auto Restart)
 npm run dev
 
 # Login to Get Token
 npm run login
 
 # Build Docker Image
 npm run docker:build
 ```
 
 ## Project Structure
 
 ```
 .
 ├── data/
 │   ├── accounts.json       # Token storage (auto-generated)
 │   └── quotas.json         # Quota cache (auto-generated)
 ├── public/
 │   ├── assets/             # Static assets
 │   ├── images/             # Generated image storage directory
 │   ├── index.html          # Web management interface
 │   ├── js/                 # Frontend logic
 │   │   ├── auth.js
 │   │   ├── config.js
 │   │   ├── logs.js         # Log management
 │   │   ├── main.js
 │   │   ├── quota.js
 │   │   ├── tokens.js
 │   │   ├── ui.js
 │   │   └── utils.js
 │   └── style.css           # Interface styles
 ├── scripts/
 │   ├── build-docker.js     # Docker build script
 │   ├── build.js            # Project build script
 │   ├── oauth-server.js     # OAuth login service
 │   └── refresh-tokens.js   # Token refresh script
 ├── src/
 │   ├── api/
 │   │   ├── client.js       # API call logic (includes model list cache)
 │   │   └── stream_parser.js # Stream response parsing (object pool optimized)
 │   ├── auth/
 │   │   ├── jwt.js          # JWT authentication
 │   │   ├── token_manager.js # Token management (includes rotation strategies)
 │   │   ├── token_store.js  # Token file storage (async read/write)
 │   │   └── quota_manager.js # Quota cache management
 │   ├── bin/
 │   │   ├── antigravity_requester_android_arm64   # Android ARM64 TLS requester
 │   │   ├── antigravity_requester_linux_amd64     # Linux AMD64 TLS requester
 │   │   └── antigravity_requester_windows_amd64.exe # Windows AMD64 TLS requester
 │   ├── config/
 │   │   ├── config.js       # Configuration loading
 │   │   └── init-env.js     # Environment variable initialization
 │   ├── constants/
 │   │   ├── index.js        # App constant definitions
 │   │   └── oauth.js        # OAuth constants
 │   ├── routes/
 │   │   ├── admin.js        # Admin interface routes
 │   │   ├── claude.js       # Claude routes
 │   │   ├── gemini.js       # Gemini routes
 │   │   ├── openai.js       # OpenAI routes
 │   │   └── sd.js           # SD WebUI compatible interface
 │   ├── server/
 │   │   ├── handlers/       # Request handlers
 │   │   │   ├── claude.js
 │   │   │   ├── gemini.js
 │   │   │   └── openai.js
 │   │   ├── index.js        # Main server (includes memory management and heartbeat)
 │   │   └── stream.js       # Stream response processing
 │   ├── utils/
 │   │   ├── configReloader.js # Configuration hot reload
 │   │   ├── converters/     # Format converters
 │   │   │   ├── claude.js
 │   │   │   ├── common.js
 │   │   │   ├── gemini.js
 │   │   │   └── openai.js
 │   │   ├── deepMerge.js    # Deep merge utility
 │   │   ├── envParser.js    # Environment variable parser
 │   │   ├── errors.js       # Unified error handling
 │   │   ├── httpClient.js   # HTTP client
 │   │   ├── idGenerator.js  # ID generator
 │   │   ├── imageStorage.js # Image storage
 │   │   ├── ipBlockManager.js # IP block management
 │   │   ├── logger.js       # Logging module
 │   │   ├── memoryManager.js # Intelligent memory management
 │   │   ├── parameterNormalizer.js # Unified parameter processing
 │   │   ├── paths.js        # Path tools (supports pkg packaging)
 │   │   ├── thoughtSignatureCache.js # Signature cache
 │   │   ├── toolConverter.js # Tool definition conversion
 │   │   ├── toolNameCache.js # Tool name cache
 │   │   └── utils.js        # Utility functions (re-exported)
 │   └── AntigravityRequester.js # TLS fingerprint requester wrapper
 ├── test/
 │   ├── test-request.js     # Request test
 │   ├── test-image-generation.js # Image generation test
 │   ├── test-token-rotation.js # Token rotation test
 │   └── test-transform.js   # Transformation test
 ├── .env                    # Environment variable configuration (sensitive info, auto-generated)
 ├── .env.example            # Environment variable configuration example
 ├── config.json             # Basic configuration file (auto-generated)
 ├── config.json.example     # Basic configuration example
 ├── Dockerfile              # Docker build file
 ├── docker-compose.yml      # Docker Compose configuration
 └── package.json            # Project configuration
 ```
 
 ## Pro Account Random ProjectId
 
 For Pro subscription accounts, you can skip API validation and directly use a randomly generated ProjectId:
 
 1. Set in `config.json`:
 ```json
 {
   "other": {
     "skipProjectIdFetch": true
   }
 }
 ```
 
 2. When running `npm run login`, it will automatically use randomly generated ProjectId.
 
 3. Existing accounts will also automatically generate random ProjectId when used.
 
 Note: This feature is only available for Pro encryption accounts. The vulnerability for free accounts using random ProjectId has been fixed officially.
 
 ## Eligibility Verification Auto Fallback
 
 When logging in via OAuth or adding a Token, the system automatically detects the account's subscription eligibility:
 
 1. **Eligible Accounts**: Use ProjectId returned by API normally.
 2. **Ineligible Accounts**: Automatically generate random ProjectId to avoid addition failure.
 
 This mechanism ensures:
 - Tokens can be successfully added regardless of whether the account has a Pro subscription.
 - Automatic downgrade handling without manual intervention.
 - Login flow is not blocked by eligibility verification failure.
 
 ## True System Message Merging
 
 This service supports merging consecutive system messages at the beginning with the global SystemInstruction:
 
 ```
 Request Messages:
 [system] You are an assistant
 [system] Please answer in English
 [user] Hello
 
 Merged:
 SystemInstruction = Global Configured System Prompt + "\n\n" + "You are an assistant\n\nPlease answer in English"
 messages = [{role: user, content: Hello}]
 ```
 
 This design:
 - Compatible with OpenAI's multiple system message format
 - Fully utilizes Antigravity's SystemInstruction feature
 - Ensures integrity and priority of system prompts
 
 ## Multi-API Format Support
 
 This service supports three API formats, each with full parameter support:
 
 ### OpenAI Format (`/v1/chat/completions`)
 
 ```json
 {
   "model": "gemini-2.0-flash-thinking-exp",
   "max_tokens": 16000,
   "temperature": 0.7,
   "top_p": 0.9,
   "top_k": 40,
   "thinking_budget": 10000,
   "reasoning_effort": "high",
   "messages": [...]
 }
 ```
 
 | Parameter | Description | Default |
 |------|------|--------|
 | `max_tokens` | Max output tokens | 32000 |
 | `temperature` | Temperature (0.0-1.0) | 1 |
 | `top_p` | Top-P sampling | 1 |
 | `top_k` | Top-K sampling | 50 |
 | `thinking_budget` | Thinking budget (1024-32000) | 1024 |
 | `reasoning_effort` | Thinking strength (`low`/`medium`/`high`) | - |
 | `response_format` | Response format support (`{ "type": "json_object" }`, Gemini models only) | - |
 
 ### Claude Format (`/v1/messages`)
 
 ```json
 {
   "model": "claude-sonnet-4-5-thinking",
   "max_tokens": 16000,
   "temperature": 0.7,
   "top_p": 0.9,
   "top_k": 40,
   "thinking": {
     "type": "enabled",
     "budget_tokens": 10000
   },
   "messages": [...]
 }
 ```
 
 | Parameter | Description | Default |
 |------|------|--------|
 | `max_tokens` | Max output tokens | 32000 |
 | `temperature` | Temperature (0.0-1.0) | 1 |
 | `top_p` | Top-P sampling | 1 |
 | `top_k` | Top-K sampling | 50 |
 | `thinking.type` | Thinking switch (`enabled`/`disabled`) | - |
 | `thinking.budget_tokens` | Thinking budget (1024-32000) | 1024 |
 
 ### Gemini Format (`/v1beta/models/:model:generateContent`)
 
 ```json
 {
   "contents": [...],
   "generationConfig": {
     "maxOutputTokens": 16000,
     "temperature": 0.7,
     "topP": 0.9,
     "topK": 40,
     "thinkingConfig": {
       "includeThoughts": true,
       "thinkingBudget": 10000
     }
   }
 }
 ```
 
 | Parameter | Description | Default |
 |------|------|--------|
 | `maxOutputTokens` | Max output tokens | 32000 |
 | `temperature` | Temperature (0.0-1.0) | 1 |
 | `topP` | Top-P sampling | 1 |
 | `topK` | Top-K sampling | 50 |
 | `thinkingConfig.includeThoughts` | Whether to include thinking content | true |
 | `thinkingConfig.thinkingBudget` | Thinking budget (1024-32000) | 1024 |
 
 ### Unified Parameter Processing
 
 Parameters from all three formats are normalized to ensure consistent behavior:
 
 1. **Parameter Priority**: Request parameters > Config default values
 2. **Thinking Budget Priority**: `thinking_budget`/`budget_tokens`/`thinkingBudget` > `reasoning_effort` > Config default values
 3. **Disable Thinking**: Set `thinking_budget=0` or `thinking.type="disabled"` or `thinkingConfig.includeThoughts=false`
 
 ### DeepSeek Thinking Format Compatibility
 
 This service automatically adapts to DeepSeek's `reasoning_content` format, outputting chain-of-thought content separately to avoid mixing with normal content:
 
 ```json
 {
   "choices": [{
     "message": {
       "content": "Final Answer",
       "reasoning_content": "This is the thinking process..."
     }
   }]
 }
 ```
 
 ### reasoning_effort Mapping
 
 | Value | Thinking Token Budget |
 |---|----------------|
 | `low` | 1024 |
 | `medium` | 16000 |
 | `high` | 32000 |
 
 ## Memory Optimization
 
 This service has been deeply optimized for memory usage:
 
 ### Optimization Results
 
 | Metric | Before Optimization | After Optimization |
 |------|--------|--------|
 | Processes | 8+ | 2 |
 | Memory Usage | 100MB+ | 50MB+ |
 | GC Frequency | High | Low |
 
 ### Optimization Methods
 
 1. **Object Pool Reuse**: Stream response objects are reused via object pool, reducing 50%+ temporary object creation.
 2. **Pre-compiled Constants**: Regex, format strings, etc., are pre-compiled to avoid repetitive creation.
 3. **LineBuffer Optimization**: Efficient stream line splitting avoids frequent string operations.
 4. **Auto Memory Cleanup**: Automatically triggers GC when heap memory exceeds threshold.
 5. **Process Streamlining**: Removed unnecessary child processes, unified processing in main process.
 
 ### Dynamic Memory Threshold
 
 Memory pressure threshold is dynamically calculated based on user-configured `memoryThreshold` (MB):
 
 | Pressure Level | Threshold Ratio | Default Value (100MB Config) | Behavior |
 |---------|---------|---------------------|------|
 | LOW | 30% | 30MB | Normal Operation |
 | MEDIUM | 60% | 60MB | Light Cleanup |
 | HIGH | 100% | 100MB | Aggressive Cleanup + GC |
 | CRITICAL | >100% | >100MB | Emergency Cleanup + Force GC |
 
 ### Configuration
 
 ```json
 {
   "server": {
     "memoryThreshold": 100
   }
 }
 ```
 
 - `memoryThreshold`: High pressure threshold (MB), other levels calculated automatically.
 
 ## Heartbeat Mechanism
 
 To prevent Cloudflare and other CDNs from disconnecting due to long periods of no response, this service implements SSE heartbeat mechanism:
 
 - Sends heartbeat packets (`: heartbeat\n\n`) periodically during streaming response.
 - Default interval 15 seconds, configurable.
 - Heartbeat packets comply with SSE specs and are automatically ignored by clients.
 
 ### Configuration
 
 ```json
 {
   "server": {
     "heartbeatInterval": 15000
   }
 }
 ```
 
 - `heartbeatInterval`: Heartbeat interval (ms), set to 0 to disable.
 
 ## Code Architecture
 
 ### Converter Module
 
 The project supports three API formats (OpenAI, Gemini, Claude), and converter code has been optimized by extracting common modules:
 
 ```
 src/utils/converters/
 ├── common.js      # Common functions (signature handling, message building, request body building etc.)
 ├── openai.js      # OpenAI format converter
 ├── claude.js      # Claude format converter
 └── gemini.js      # Gemini format converter
 ```
 
 #### Common Functions
 
 | Function | Description |
 |------|------|
 | `getSignatureContext()` | Get thought signature and tool signature |
 | `pushUserMessage()` | Add user message to message array |
 | `findFunctionNameById()` | Find function name by tool call ID |
 | `pushFunctionResponse()` | Add function response to message array |
 | `createThoughtPart()` | Create thought part with signature |
 | `createFunctionCallPart()` | Create function call part with signature |
 | `processToolName()` | Process tool name mapping |
 | `pushModelMessage()` | Add model message to message array |
 | `buildRequestBody()` | Build Antigravity request body |
 | `mergeSystemInstruction()` | Merge system instructions |
 
 ### Parameter Normalization Module
 
 ```
 src/utils/parameterNormalizer.js  # Unified parameter processing
 ```
 
 Unifies parameters from OpenAI, Claude, Gemini formats into internal format:
 
 | Function | Description |
 |------|------|
 | `normalizeOpenAIParameters()` | Normalize OpenAI format parameters |
 | `normalizeClaudeParameters()` | Normalize Claude format parameters |
 | `normalizeGeminiParameters()` | Normalize Gemini format parameters |
 | `toGenerationConfig()` | Convert to upstream API format |
 
 ### Tool Conversion Module
 
 ```
 src/utils/toolConverter.js  # Unified tool definition conversion
 ```
 
 Supports converting tool definitions from OpenAI, Claude, Gemini formats to Antigravity format.
 
 ## Notes
 
 1. Automatically creates `.env` and `config.json` on first launch (if not exist).
 2. If credentials not configured, system automatically generates random credentials and displays them on startup.
 3. Run `npm run login` to get Token.
 4. `.env`, `config.json`, and `data/accounts.json` contain sensitive info, do not leak.
 5. Supports multi-account rotation for high availability.
 6. Tokens automatically refresh, no manual maintenance needed.
 
 ## License
 
 MIT
