/**
 * DARIUS OSS - Memory Subsystem Inspector Component
 * Live interactive playground for short-term conversational state and long-term multi-criteria retrieval
 */

import React, { useState, useMemo } from 'react';
import {
  Database,
  Search,
  Plus,
  Trash2,
  Sliders,
  Sparkles,
  Clock,
  Tag,
  ArrowRight,
  MessageSquare,
  Minimize2,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { MemoryManager } from '../ai/memory/manager.ts';
import { LongTermMemoryItem, MemoryCategory, MemorySearchResult } from '../ai/memory/types.ts';
import { MemoryEntry } from '../ai/context/types.ts';

interface MemoryInspectorProps {
  onApplyMemoriesToContext?: (entries: MemoryEntry[]) => void;
  defaultTaskGoal?: string;
}

export const MemoryInspector: React.FC<MemoryInspectorProps> = ({
  onApplyMemoriesToContext,
  defaultTaskGoal = 'Diagnose latency spike in payments gateway and report root cause.',
}) => {
  // Initialize MemoryManager instance
  const [manager] = useState<MemoryManager>(() => {
    const mem = new MemoryManager({
      maxShortTermMessages: 8,
      maxShortTermTokens: 1200,
      maxLongTermItems: 100,
      autoCompact: true,
    });

    // Seed long-term memories
    mem.addLongTermMemory({
      id: 'mem_gw_timeout',
      content: 'Gateway timeout configuration is 5000ms at the reverse proxy tier.',
      category: 'workspace_fact',
      tags: ['gateway', 'proxy', 'timeout', 'latency'],
      importance: 0.95,
      source: 'document',
    });

    mem.addLongTermMemory({
      id: 'mem_db_pool',
      content: 'Database connection pool max limit is configured to 20 connections on payment DB.',
      category: 'workspace_fact',
      tags: ['database', 'payments', 'connections', 'pool'],
      importance: 0.9,
      source: 'workspace_fact' as any,
    });

    mem.addLongTermMemory({
      id: 'mem_pref_lang',
      content: 'User prefers concise root-cause summaries formatted with technical precision.',
      category: 'user_preference',
      tags: ['user', 'preferences', 'summary', 'formatting'],
      importance: 0.8,
      source: 'user',
    });

    mem.addLongTermMemory({
      id: 'mem_rollout_build',
      content: 'Deployment build #8421 deployed payment-service canary 3 hours ago.',
      category: 'episodic_summary',
      tags: ['deployment', 'canary', 'payments', 'build'],
      importance: 0.85,
      source: 'agent',
    });

    mem.addLongTermMemory({
      id: 'mem_general_tip',
      content: 'Standard rate limit for public endpoints is 100 requests per minute per IP.',
      category: 'domain_knowledge',
      tags: ['ratelimit', 'security', 'api'],
      importance: 0.5,
      source: 'document',
    });

    // Seed short-term conversation
    mem.addMessage('user', 'Alert triggered: payment gateway latency exceeding threshold.');
    mem.addMessage('assistant', 'Investigating payment gateway latency. Pulling telemetry and inspecting connection pools.');

    return mem;
  });

  // State
  const [query, setQuery] = useState<string>(defaultTaskGoal);
  const [relevanceWeight, setRelevanceWeight] = useState<number>(0.55);
  const [importanceWeight, setImportanceWeight] = useState<number>(0.25);
  const [recencyWeight, setRecencyWeight] = useState<number>(0.20);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [syncFeedback, setSyncFeedback] = useState<boolean>(false);

  // New Memory Form State
  const [newContent, setNewContent] = useState<string>('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('workspace_fact');
  const [newTags, setNewTags] = useState<string>('');
  const [newImportance, setNewImportance] = useState<number>(0.8);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // New Short-term Message State
  const [newMessageRole, setNewMessageRole] = useState<'user' | 'assistant'>('user');
  const [newMessageContent, setNewMessageContent] = useState<string>('');

  // Version counter to trigger re-renders on manager mutations
  const [version, setVersion] = useState<number>(0);
  const bumpVersion = () => setVersion((v) => v + 1);

  // Active Long-Term Memories
  const allLongTermItems = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version;
    return manager.listLongTermMemories();
  }, [manager, version]);

  // Short-Term Conversation Turns
  const shortTermTurns = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version;
    return manager.getShortTermTurns();
  }, [manager, version]);

  // Short-Term Token Usage
  const shortTermTokens = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version;
    return manager.estimateShortTermTokens();
  }, [manager, version]);

  // Live Query Retrieval Results
  const searchResults: MemorySearchResult[] = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version;
    if (!query.trim()) return [];
    return manager.retrieveRelevant(query, {
      limit: 5,
      minRelevance: 0.1,
      relevanceWeight,
      importanceWeight,
      recencyWeight,
      categories: selectedCategory === 'all' ? undefined : [selectedCategory as MemoryCategory],
    });
  }, [manager, query, relevanceWeight, importanceWeight, recencyWeight, selectedCategory, version]);

  // Handlers
  const handleAddLongTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    manager.addLongTermMemory({
      content: newContent.trim(),
      category: newCategory,
      tags: newTags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      importance: newImportance,
      source: 'user',
    });

    setNewContent('');
    setNewTags('');
    setShowAddForm(false);
    bumpVersion();
  };

  const handleDeleteLongTerm = (id: string) => {
    manager.deleteLongTermMemory(id);
    bumpVersion();
  };

  const handleAddShortTermMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageContent.trim()) return;

    manager.addMessage(newMessageRole, newMessageContent.trim());
    setNewMessageContent('');
    bumpVersion();
  };

  const handleTriggerCompaction = () => {
    manager.compactShortTerm();
    bumpVersion();
  };

  const handleSyncToContext = () => {
    if (!onApplyMemoriesToContext) return;
    const entries = manager.retrieveRelevantAsEntries(query, {
      limit: 5,
      relevanceWeight,
      importanceWeight,
      recencyWeight,
    });
    onApplyMemoriesToContext(entries);
    setSyncFeedback(true);
    setTimeout(() => setSyncFeedback(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">
              Memory Subsystem & Multi-Criteria Retrieval
            </h2>
          </div>
          <p className="text-xs text-zinc-600">
            Coordinates bounded short-term conversation state with auto-compaction and multi-tiered long-term context scoring.
          </p>
        </div>

        {onApplyMemoriesToContext && (
          <button
            type="button"
            onClick={handleSyncToContext}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              syncFeedback
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            }`}
          >
            {syncFeedback ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Synchronized with Prompt!</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Inject Top Memories into Prompt</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Retrieval Engine & Query Playground */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-zinc-700" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                  Live Relevance Retrieval Engine
                </h3>
              </div>
              <span className="text-[11px] font-mono text-zinc-500">
                {searchResults.length} matches found
              </span>
            </div>

            {/* Search Input & Goal Matcher */}
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter task goal, keyword, or query..."
                  className="w-full text-xs p-2.5 pl-8 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-800"
                />
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-3" />
              </div>

              {/* Weight Controls */}
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-700">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-zinc-500" />
                    Multi-Criteria Scoring Weights
                  </span>
                  <span className="font-mono text-zinc-500">
                    Lexical: {relevanceWeight} | Importance: {importanceWeight} | Recency: {recencyWeight}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-[10px]">
                  <div>
                    <label className="block text-zinc-600 mb-1">Relevance (TF-IDF + Tags)</label>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.05"
                      value={relevanceWeight}
                      onChange={(e) => setRelevanceWeight(parseFloat(e.target.value))}
                      className="w-full accent-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-600 mb-1">Importance Prior</label>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.05"
                      value={importanceWeight}
                      onChange={(e) => setImportanceWeight(parseFloat(e.target.value))}
                      className="w-full accent-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-600 mb-1">Recency Half-Life</label>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.05"
                      value={recencyWeight}
                      onChange={(e) => setRecencyWeight(parseFloat(e.target.value))}
                      className="w-full accent-zinc-800"
                    />
                  </div>
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-medium text-zinc-500 mr-1">Filter:</span>
                {['all', 'workspace_fact', 'user_preference', 'episodic_summary', 'domain_knowledge'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                      selectedCategory === cat
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Retrieval Results List */}
            <div className="mt-4 space-y-2.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Ranked Retrieval Context (Composite Score)
              </h4>

              {searchResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg">
                  No memories meet the minimum composite relevance threshold for this query.
                </div>
              ) : (
                searchResults.map((res, idx) => (
                  <div
                    key={res.item.id}
                    className="p-3 bg-white border border-zinc-200 rounded-lg shadow-2xs hover:border-zinc-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-zinc-900 text-white text-[10px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {res.item.category}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          ID: {res.item.id}
                        </span>
                      </div>

                      {/* Score Badge */}
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-1.5">
                          <span title="Lexical match">R: {res.relevanceScore}</span>
                          <span title="Importance prior">I: {res.importanceScore}</span>
                          <span title="Recency score">T: {res.recencyScore}</span>
                        </div>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-900 text-amber-400">
                          ★ {(res.score * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-800 font-mono pl-6 leading-relaxed">
                      {res.item.content}
                    </p>

                    <div className="flex items-center gap-2 mt-2 pl-6 text-[10px] text-zinc-500">
                      <Tag className="w-3 h-3 text-zinc-400" />
                      <span>{res.item.tags.join(', ')}</span>
                      <span className="text-zinc-300">•</span>
                      <span>Accessed: {res.item.accessCount}x</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Short-Term Conversation & Long-Term Management */}
        <div className="lg:col-span-5 space-y-4">
          {/* Short-Term Conversational State */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                  Short-Term Conversation State
                </h3>
              </div>
              <span className="text-[11px] font-mono text-zinc-500">
                ~{shortTermTokens} tokens ({shortTermTurns.length} turns)
              </span>
            </div>

            <p className="text-[11px] text-zinc-500 mb-3">
              Sliding window with auto-compaction. Older turns are automatically compressed into episodic summaries.
            </p>

            {/* Turns list */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {shortTermTurns.map((turn) => (
                <div
                  key={turn.id}
                  className={`p-2 rounded text-xs border ${
                    turn.role === 'user'
                      ? 'bg-sky-50/60 border-sky-200 text-sky-950'
                      : turn.role === 'assistant'
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                      : 'bg-amber-50 border-amber-200 text-amber-950 italic'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono mb-0.5 opacity-70">
                    <span className="uppercase font-bold">{turn.role}</span>
                    <span>{turn.tokens} tok</span>
                  </div>
                  <p className="text-[11px] font-mono leading-relaxed">{turn.content}</p>
                </div>
              ))}
            </div>

            {/* Message Simulator Form */}
            <form onSubmit={handleAddShortTermMessage} className="mt-3 pt-3 border-t border-zinc-100 flex gap-2">
              <select
                value={newMessageRole}
                onChange={(e) => setNewMessageRole(e.target.value as any)}
                className="text-[11px] font-semibold bg-zinc-50 border border-zinc-200 rounded px-2 py-1 focus:outline-none"
              >
                <option value="user">User</option>
                <option value="assistant">Assistant</option>
              </select>
              <input
                type="text"
                value={newMessageContent}
                onChange={(e) => setNewMessageContent(e.target.value)}
                placeholder="Append conversation turn..."
                className="flex-1 text-xs p-1.5 bg-zinc-50 border border-zinc-200 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
              <button
                type="submit"
                className="px-2.5 py-1 text-xs font-semibold bg-zinc-900 text-white rounded hover:bg-zinc-800"
              >
                Add
              </button>
            </form>

            <div className="flex items-center justify-end mt-2">
              <button
                type="button"
                onClick={handleTriggerCompaction}
                className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900"
              >
                <Minimize2 className="w-3 h-3" />
                <span>Trigger Manual Compaction</span>
              </button>
            </div>
          </div>

          {/* Long-Term Memory Inventory & Add Form */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                  Long-Term Memory Records ({allLongTermItems.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
              >
                <Plus className="w-3.5 h-3.5" />
                {showAddForm ? 'Close' : 'New Memory'}
              </button>
            </div>

            {/* Add Memory Form */}
            {showAddForm && (
              <form onSubmit={handleAddLongTerm} className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg mb-3 space-y-2 text-xs">
                <span className="font-bold text-zinc-800 block text-[11px]">Add Long-Term Memory Record</span>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Memory content (e.g. timeout rule, user preference)..."
                  rows={2}
                  className="w-full p-2 bg-white border border-zinc-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-zinc-800"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Category</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                      className="w-full p-1.5 bg-white border border-zinc-200 rounded text-xs focus:outline-none"
                    >
                      <option value="workspace_fact">Workspace Fact</option>
                      <option value="user_preference">User Preference</option>
                      <option value="domain_knowledge">Domain Knowledge</option>
                      <option value="episodic_summary">Episodic Summary</option>
                      <option value="entity_profile">Entity Profile</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Importance (0.0 to 1.0)</label>
                    <input
                      type="number"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={newImportance}
                      onChange={(e) => setNewImportance(parseFloat(e.target.value))}
                      className="w-full p-1.5 bg-white border border-zinc-200 rounded text-xs focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-0.5">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="e.g. gateway, timeout, latency"
                    className="w-full p-1.5 bg-white border border-zinc-200 rounded text-xs focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 bg-zinc-900 text-white font-semibold rounded text-xs hover:bg-zinc-800 mt-1"
                >
                  Save Record
                </button>
              </form>
            )}

            {/* Inventory Scroll List */}
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {allLongTermItems.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded bg-zinc-50 border border-zinc-200 flex items-start justify-between gap-2 text-xs"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-mono uppercase px-1 rounded bg-zinc-200/80 text-zinc-700">
                        {item.category}
                      </span>
                      <span className="text-[10px] font-mono text-amber-600 font-semibold">
                        ★ {item.importance}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-800 leading-snug">{item.content}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-400">
                      <span>[{item.tags.join(', ')}]</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteLongTerm(item.id)}
                    className="text-zinc-400 hover:text-red-600 pt-1"
                    title="Delete record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
