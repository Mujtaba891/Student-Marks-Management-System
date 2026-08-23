const fs = require('fs');
const file = 'src/ui/appRenderer.ts';
let code = fs.readFileSync(file, 'utf8');

const oldInsightsHTML = `        <div id="insights_page_content" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 min-h-[400px] flex items-center justify-center">
          <div class="flex flex-col items-center justify-center text-center">
            <div class="w-12 h-12 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mb-4"></div>
            <div class="text-slate-500 font-semibold animate-pulse">Consulting AI model...</div>
          </div>
        </div>`;

const newInsightsHTML = `        <div id="insights_page_content" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 min-h-[400px] flex items-center justify-center">
          <div class="flex flex-col items-center justify-center text-center">
            <div class="w-12 h-12 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mb-4"></div>
            <div class="text-slate-500 font-semibold animate-pulse">Consulting AI model...</div>
          </div>
        </div>
        
        <!-- Chat Assistant Panel -->
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 mt-6 shadow-sm">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              \${icons.sparkles}
            </div>
            <div>
              <h2 class="font-bold text-slate-900 dark:text-white text-lg">Ask AI Data Analyst</h2>
              <p class="text-xs text-slate-500">Query your class performance data in natural language.</p>
            </div>
          </div>
          <div id="ai_chat_history" class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 h-64 overflow-y-auto mb-4 space-y-4 border border-slate-100 dark:border-slate-800">
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-full bg-amber-500 text-white flex flex-shrink-0 items-center justify-center font-bold text-xs">\${icons.sparkles}</div>
              <div class="bg-white dark:bg-slate-700 p-3 rounded-2xl rounded-tl-sm text-sm shadow-sm border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200">
                Hello! I'm your AI Analyst. You can ask me questions like:
                <ul class="list-disc ml-5 mt-2 text-xs space-y-1">
                  <li>"Who is failing in Mathematics?"</li>
                  <li>"Draft a warning letter for Zoya's parents."</li>
                  <li>"What's the overall trend of this class?"</li>
                </ul>
              </div>
            </div>
          </div>
          <form id="ai_chat_form" class="flex gap-2">
            <input type="text" id="ai_chat_input" placeholder="Ask a question about the class..." class="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"/>
            <button type="submit" class="px-6 py-3 bg-slate-900 dark:bg-amber-500 text-white font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-amber-400 transition-colors shadow-md flex items-center gap-2">
              Send \${icons.arrowRight}
            </button>
          </form>
        </div>`;

code = code.replace(oldInsightsHTML, newInsightsHTML);

const oldInsightsJS = `      const refreshBtn = document.getElementById('btn_refresh_insights');
      if (refreshBtn) {
        refreshBtn.onclick = () => {
          this.render(); // reset to loading
          this.loadInsightsData(); // fetch again
        };
      }`;

const newInsightsJS = `      const refreshBtn = document.getElementById('btn_refresh_insights');
      if (refreshBtn) {
        refreshBtn.onclick = () => {
          this.render(); // reset to loading
          this.loadInsightsData(); // fetch again
        };
      }
      
      const chatForm = document.getElementById('ai_chat_form') as HTMLFormElement;
      const chatInput = document.getElementById('ai_chat_input') as HTMLInputElement;
      const chatHistory = document.getElementById('ai_chat_history') as HTMLDivElement;
      
      if (chatForm && chatInput && chatHistory) {
        chatForm.onsubmit = async (e) => {
          e.preventDefault();
          const question = chatInput.value.trim();
          if (!question) return;
          
          // Add User Message
          const userDiv = document.createElement('div');
          userDiv.className = 'flex items-start gap-3 flex-row-reverse';
          userDiv.innerHTML = \`
            <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex flex-shrink-0 items-center justify-center font-bold text-xs">\${icons.user}</div>
            <div class="bg-sky-500 text-white p-3 rounded-2xl rounded-tr-sm text-sm shadow-sm max-w-[80%]">\${question}</div>
          \`;
          chatHistory.appendChild(userDiv);
          chatInput.value = '';
          chatHistory.scrollTop = chatHistory.scrollHeight;
          
          // Add AI Loading Message
          const aiLoadingDiv = document.createElement('div');
          aiLoadingDiv.className = 'flex items-start gap-3';
          aiLoadingDiv.innerHTML = \`
            <div class="w-8 h-8 rounded-full bg-amber-500 text-white flex flex-shrink-0 items-center justify-center font-bold text-xs">\${icons.sparkles}</div>
            <div class="bg-white dark:bg-slate-700 p-3 rounded-2xl rounded-tl-sm text-sm shadow-sm border border-slate-200 dark:border-slate-600 text-slate-500 animate-pulse flex items-center gap-2">
              <div class="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div> Thinking...
            </div>
          \`;
          chatHistory.appendChild(aiLoadingDiv);
          chatHistory.scrollTop = chatHistory.scrollHeight;
          
          try {
            // Provide context for AI
            const summaryData = {
              students: this.studentsCache.map(s => ({ name: s.name, roll: s.rollNumber, dynamicFields: s.dynamicFields, status: s.dynamicFields?.Status || 'N/A' })),
              classPerformanceSummary: data.classSummary
            };
            const res = await fetch('/api/gemini/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: question, classData: summaryData })
            });
            const answer = await res.json();
            
            aiLoadingDiv.innerHTML = \`
              <div class="w-8 h-8 rounded-full bg-amber-500 text-white flex flex-shrink-0 items-center justify-center font-bold text-xs">\${icons.sparkles}</div>
              <div class="bg-white dark:bg-slate-700 p-3 rounded-2xl rounded-tl-sm text-sm shadow-sm border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 markdown-body prose prose-sm dark:prose-invert">
                \${answer.text ? answer.text.replace(/\\n/g, '<br/>') : 'Sorry, I could not process that.'}
              </div>
            \`;
            chatHistory.scrollTop = chatHistory.scrollHeight;
          } catch (err: any) {
             aiLoadingDiv.innerHTML = \`
              <div class="w-8 h-8 rounded-full bg-rose-500 text-white flex flex-shrink-0 items-center justify-center font-bold text-xs">\${icons.alert}</div>
              <div class="bg-rose-50 text-rose-700 p-3 rounded-2xl rounded-tl-sm text-sm shadow-sm border border-rose-200">
                Failed to connect to AI Analyst: \${err.message}
              </div>
            \`;
          }
        };
      }`;

code = code.replace(oldInsightsJS, newInsightsJS);

fs.writeFileSync(file, code);
