class Dashboard {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.isChatView = true;
        
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.timestamp = document.getElementById('timestamp');
        this.allContent = document.getElementById('allContent');
        this.viewToggle = document.getElementById('viewToggle');
        this.prevButton = document.getElementById('prevButton');
        this.nextButton = document.getElementById('nextButton');
        this.navInfo = document.getElementById('navInfo');
        
        this.allEntries = [];
        this.currentIndex = -1;
        this.autoScrollToLatest = true;
        
        this.setupEventListeners();
        this.connect();
    }

    setupEventListeners() {
        this.viewToggle.addEventListener('click', () => {
            this.toggleView();
        });
        
        this.prevButton.addEventListener('click', () => {
            this.navigatePrevious();
        });
        
        this.nextButton.addEventListener('click', () => {
            this.navigateNext();
        });
    }

    toggleView() {
        this.isChatView = !this.isChatView;
        
        if (this.isChatView) {
            this.viewToggle.textContent = 'Show Raw JSON';
            this.allContent.className = 'chat-viewer';
        } else {
            this.viewToggle.textContent = 'Show Chat View';
            this.allContent.className = 'json-viewer';
        }
        
        // Re-render current data with new view
        if (this.currentIndex >= 0 && this.currentIndex < this.allEntries.length) {
            this.displayEntry(this.currentIndex);
        }
    }
    
    navigatePrevious() {
        if (this.currentIndex > 0) {
            this.autoScrollToLatest = false;
            this.currentIndex--;
            this.displayEntry(this.currentIndex);
        }
    }
    
    navigateNext() {
        if (this.currentIndex < this.allEntries.length - 1) {
            this.currentIndex++;
            this.displayEntry(this.currentIndex);
            // Re-enable auto-scroll if we navigate to the latest entry
            this.autoScrollToLatest = (this.currentIndex === this.allEntries.length - 1);
        }
    }
    
    displayEntry(index) {
        if (index >= 0 && index < this.allEntries.length) {
            this.updateContent(this.allEntries[index]);
            this.updateNavigation();
        }
    }
    
    updateNavigation() {
        const total = this.allEntries.length;
        const current = total > 0 ? this.currentIndex + 1 : 0;
        
        this.navInfo.textContent = `${current} / ${total}`;
        
        this.prevButton.disabled = this.currentIndex <= 0 || total === 0;
        this.nextButton.disabled = this.currentIndex >= total - 1 || total === 0;
        
        // Add visual indicator if auto-scroll is disabled
        if (!this.autoScrollToLatest && this.currentIndex < this.allEntries.length - 1) {
            this.navInfo.classList.add('manual-nav');
        } else {
            this.navInfo.classList.remove('manual-nav');
        }
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Connected to WebSocket');
            this.updateStatus(true);
            this.reconnectAttempts = 0;
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'initial') {
                // Initial load of all entries
                this.allEntries = data.entries || [];
                if (this.allEntries.length > 0) {
                    this.currentIndex = this.allEntries.length - 1;
                    this.displayEntry(this.currentIndex);
                } else {
                    // No entries yet, update navigation to show 0/0
                    this.updateNavigation();
                }
            } else if (data.type === 'update') {
                // New entry received
                this.allEntries.push(data.entry);
                
                // Auto-scroll to latest if enabled
                if (this.autoScrollToLatest) {
                    this.currentIndex = this.allEntries.length - 1;
                    this.displayEntry(this.currentIndex);
                } else {
                    // Just update navigation to show new total
                    this.updateNavigation();
                }
            }
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket connection closed');
            this.updateStatus(false);
            this.attemptReconnect();
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus(false);
        };
    }

    updateStatus(connected) {
        if (connected) {
            this.statusDot.classList.add('connected');
            this.statusText.textContent = 'Connected';
        } else {
            this.statusDot.classList.remove('connected');
            this.statusText.textContent = 'Disconnected';
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.statusText.textContent = `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`;
            
            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay * this.reconnectAttempts);
        } else {
            this.statusText.textContent = 'Connection failed';
        }
    }

    updateContent(data) {
        
        if (data.timestamp) {
            const date = new Date(data.timestamp);
            this.timestamp.textContent = `Last updated: ${date.toLocaleString()}`;
        }

        let content = '';

        if (data.request) {
            try {
                const requestData = typeof data.request === 'string' ? JSON.parse(data.request) : data.request;
                
                if (this.isChatView) {
                    content += '<h3 class="section-header request">📤 Request</h3>';
                    content += this.formatChatMessages(requestData);
                } else {
                    content += '<h3 class="section-header request">📤 Request</h3>';
                    content += this.formatJSON(requestData);
                }
            } catch (e) {
                content += `<pre>${data.request}</pre>`;
            }
        }

        if (data.response) {
            if (this.isChatView) {
                content += '<h3 class="section-header response">📥 Response</h3>';
                content += this.formatResponseChat(data.response);
            } else {
                content += '<h3 class="section-header response">📥 Response</h3>';
                content += this.formatJSON(data.response);
            }
        }

        this.allContent.innerHTML = content || '<div class="empty-state"><div class="icon">📬</div><p>Waiting for requests...</p></div>';
    }

    formatChatMessages(requestData) {
        if (!requestData.messages || !Array.isArray(requestData.messages)) {
            return '<div class="empty-state"><div class="icon">💬</div><p>No messages found in request</p></div>';
        }

        const messagesHtml = requestData.messages.map(message => {
            const role = message.role || 'unknown';
            let contentHtml = '';
            
            // Handle different content formats
            if (Array.isArray(message.content)) {
                // Claude format with content array
                contentHtml = message.content.map(item => {
                    if (item.type === 'text') {
                        return this.renderMarkdown(item.text || '');
                    } else if (item.type === 'image') {
                        return '<div class="content-image">[Image]</div>';
                    } else if (item.type === 'tool_use') {
                        return `<div class="tool-use">
                            <div class="tool-header">🔧 Tool: ${item.name || 'unknown'}</div>
                            <pre class="tool-input">${JSON.stringify(item.input, null, 2)}</pre>
                        </div>`;
                    } else if (item.type === 'tool_result') {
                        return `<div class="tool-result">
                            <div class="tool-header">📊 Tool Result (${item.tool_use_id || 'unknown'})</div>
                            <pre class="tool-output">${this.escapeHtml(item.content || '')}</pre>
                        </div>`;
                    } else {
                        return `<div class="unknown-content">[${item.type || 'unknown'}]</div>`;
                    }
                }).join('');
            } else if (typeof message.content === 'string') {
                // Simple string content
                contentHtml = this.renderMarkdown(message.content);
            } else if (message.content && typeof message.content === 'object') {
                // Object content - try to display it
                contentHtml = `<pre>${JSON.stringify(message.content, null, 2)}</pre>`;
            }
            
            return `
                <div class="message ${role}">
                    <div class="role">${role}</div>
                    <div class="content">${contentHtml}</div>
                </div>
            `;
        }).join('');

        return messagesHtml;
    }

    formatResponseChat(responseData) {
        // Handle OpenAI/OpenRouter format with choices
        if (responseData.choices && responseData.choices.length > 0) {
            const choice = responseData.choices[0];
            if (choice.message) {
                const role = choice.message.role || 'assistant';
                const content = choice.message.content || '';
                
                return `
                    <div class="message ${role}">
                        <div class="role">${role}</div>
                        <div class="content">${this.renderMarkdown(content)}</div>
                    </div>
                `;
            }
        }
        
        // Handle Claude format with content array
        if (responseData.content && Array.isArray(responseData.content)) {
            const role = responseData.role || 'assistant';
            const contentHtml = responseData.content.map(item => {
                if (item.type === 'text') {
                    return this.renderMarkdown(item.text || '');
                } else if (item.type === 'tool_use') {
                    return `<div class="tool-use">
                        <div class="tool-header">🔧 Tool: ${item.name || 'unknown'}</div>
                        <pre class="tool-input">${JSON.stringify(item.input, null, 2)}</pre>
                    </div>`;
                } else {
                    return `<div class="unknown-content">[${item.type || 'unknown'}]</div>`;
                }
            }).join('');
            
            return `
                <div class="message ${role}">
                    <div class="role">${role}</div>
                    <div class="content">${contentHtml}</div>
                </div>
            `;
        }
        
        // Handle Claude format with single content field
        if (responseData.role && responseData.content) {
            return `
                <div class="message ${responseData.role}">
                    <div class="role">${responseData.role}</div>
                    <div class="content">${this.renderMarkdown(responseData.content)}</div>
                </div>
            `;
        }
        
        return '<div class="empty-state"><div class="icon">🤖</div><p>No assistant message found in response</p></div>';
    }

    renderMarkdown(text) {
        // Use marked.js library for proper markdown rendering
        if (typeof marked !== 'undefined') {
            return marked.parse(text);
        } else {
            // Fallback if marked.js doesn't load
            return this.escapeHtml(text).replace(/\n/g, '<br>');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatJSON(obj) {
        return `<pre>${this.syntaxHighlight(JSON.stringify(obj, null, 2))}</pre>`;
    }

    syntaxHighlight(json) {
        return json
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
                let cls = 'json-number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key';
                    } else {
                        cls = 'json-string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }
                return `<span class="${cls}">${match}</span>`;
            });
    }
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});