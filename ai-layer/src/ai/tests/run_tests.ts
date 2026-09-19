/**
 * DARIUS OSS - AI Layer Automated Verification Suite
 */

import {
  GeminiProvider,
  MockProvider,
  ContextBuilder,
  ReasoningEngine,
  AgentDecisionSchema,
  ModelRouter,
  AgentEvaluator,
  EVALUATION_FIXTURES,
  MemoryManager,
} from '../index.ts';

async function runAllTests() {
  console.log('🧪 Starting DARIUS OSS AI Layer Verification Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // TEST 1: Model Interface & Mock Provider Conformance
  console.log('Test 1: Model Interface & MockProvider');
  const mockModel = new MockProvider('mock-test-v1');
  const caps = mockModel.capabilities();
  assert(caps.modelId === 'mock-test-v1', 'Model ID matches');
  assert(caps.streaming === true, 'Streaming capability declared');
  assert(caps.structuredOutput === true, 'Structured output capability declared');

  const genOutput = await mockModel.generate('search for AI architecture');
  assert(genOutput.text.length > 0, 'Generated text output returned');
  assert(genOutput.toolCalls !== undefined && genOutput.toolCalls.length > 0, 'Tool call generated on keyword');
  assert(genOutput.toolCalls?.[0].name === 'web_search', 'Correct tool name invoked');

  // TEST 2: Streaming output
  console.log('\nTest 2: Stream Output Generation');
  let streamText = '';
  for await (const chunk of mockModel.stream('calculate revenue')) {
    streamText = chunk.text;
  }
  assert(streamText.length > 0, 'Streaming yielded complete text');

  // TEST 3: Structured Output Schema
  console.log('\nTest 3: Structured Output with Schema');
  const structuredRes = await mockModel.structuredOutput('Plan execution', AgentDecisionSchema);
  assert(typeof structuredRes.thought === 'string', 'AgentDecision thought field present');
  assert(typeof structuredRes.confidence === 'number', 'AgentDecision confidence field present');

  // TEST 4: GeminiProvider Class Conformance
  console.log('\nTest 4: GeminiProvider Conformance');
  const gemini = new GeminiProvider({ modelId: 'gemini-3.8-flash' });
  const geminiCaps = gemini.capabilities();
  assert(geminiCaps.modelId === 'gemini-3.8-flash', 'GeminiProvider modelId matches');
  assert(geminiCaps.providerId === 'google-genai', 'GeminiProvider providerId matches');
  assert(geminiCaps.maxContextTokens === 1048576, 'Gemini 1M context window declared');

  // TEST 5: Context Engineering Layer Separation
  console.log('\nTest 5: Context Engineering Layer Separation');
  const builder = new ContextBuilder();
  builder.setSystemInstruction('System rule: Be concise and factual.');
  builder.setTaskContext({
    goal: 'Audit security rules',
    sessionId: 'session_test_01',
    constraints: ['Do not delete user data'],
  });
  builder.addMemory({
    id: 'mem_1',
    source: 'semantic_search',
    content: 'User prefers Portuguese documentation',
    relevanceScore: 0.95,
  });
  builder.addObservation({
    stepIndex: 1,
    toolName: 'read_config',
    args: { path: '/etc/config.json' },
    result: { port: 3000, secure: true },
    timestamp: Date.now(),
  });
  builder.addExecutionHistory({
    stepIndex: 1,
    thought: 'Checked config file status',
    actionTaken: 'read_config',
    outcomeSummary: 'Config read successfully',
  });

  const assembled = builder.build({ maxTotalTokens: 4096, reservedForOutput: 512 });
  assert(assembled.systemInstruction.includes('concise and factual'), 'System instruction properly extracted');
  assert(assembled.tokenEstimate.total > 0, 'Token breakdown estimated');
  assert(assembled.tokenEstimate.breakdown.memory > 0, 'Memory tokens tracked separately');
  assert(assembled.tokenEstimate.breakdown.observations > 0, 'Observation tokens tracked separately');

  // TEST 6: Bounded Reasoning Engine & Loop Breaker
  console.log('\nTest 6: Reasoning Loop & Bounded Steps');
  const engine = new ReasoningEngine(mockModel);
  const reasoningResult = await engine.executeTask('Compute revenue step by step', builder, {
    maxSteps: 3,
  });
  assert(reasoningResult.steps.length <= 3, 'Reasoning respected maxSteps boundary');
  assert(reasoningResult.totalLatencyMs >= 0, 'Latency measured');
  assert(reasoningResult.totalTokens > 0, 'Tokens measured');

  // TEST 7: Model Router
  console.log('\nTest 7: Model Router Decision Engine');
  const router = new ModelRouter([gemini, mockModel]);
  const simpleRoute = router.route({
    taskDescription: 'Translate this phrase to French',
    priority: 'cost',
  });
  assert(simpleRoute.assessedComplexity === 'simple', 'Assessed simple complexity for translation');

  const complexRoute = router.route({
    taskDescription: 'Design a distributed consensus architecture with formal proof',
    priority: 'quality',
  });
  assert(complexRoute.assessedComplexity === 'complex', 'Assessed complex complexity for distributed architecture');

  // TEST 8: Evaluation Suite
  console.log('\nTest 8: Agent Evaluation Suite against Fixtures');
  const evaluator = new AgentEvaluator(mockModel);
  const report = await evaluator.runBenchmark(EVALUATION_FIXTURES.slice(0, 3));
  assert(report.totalCases === 3, 'Evaluated all 3 fixture cases');
  assert(report.metricAverages.safety >= 0, 'Safety metric calculated');
  assert(report.metricAverages.toolCorrectness >= 0, 'Tool correctness metric calculated');

  // TEST 9: MemoryManager (Short-term Conversation & Long-term Context Retrieval)
  console.log('\nTest 9: MemoryManager Conversational State & Long-term Retrieval');
  const memManager = new MemoryManager({
    maxShortTermMessages: 5,
    maxShortTermTokens: 500,
    maxLongTermItems: 100,
    autoCompact: true,
  });

  // Test 9.1: Short-term conversation turn addition
  memManager.addMessage('user', 'Hello, my name is Alex and I am developing a distributed payments system.');
  memManager.addMessage('assistant', 'Understood, Alex. I am ready to assist with your distributed payments system.');
  const recent = memManager.getRecentMessages();
  assert(recent.length === 2, 'Recent short-term messages retrieved');
  assert(recent[0].role === 'user', 'First message role is user');
  assert(recent[1].content.includes('Alex'), 'Second message content preserved');
  assert(memManager.estimateShortTermTokens() > 0, 'Token estimation works');

  // Test 9.2: Long-term memory store and search
  memManager.addLongTermMemory({
    id: 'pref_lang',
    content: 'User prefers technical documentation in TypeScript and Portuguese.',
    category: 'user_preference',
    tags: ['preferences', 'language', 'typescript'],
    importance: 0.9,
    source: 'user',
  });
  memManager.addLongTermMemory({
    id: 'pay_sla',
    content: 'Payments SLA requires p99 latency under 250ms with 99.99% availability.',
    category: 'workspace_fact',
    tags: ['payments', 'sla', 'latency', 'architecture'],
    importance: 0.95,
    source: 'document',
  });
  memManager.addLongTermMemory({
    id: 'gardening_note',
    content: 'Tomatoes need direct sunlight and regular watering every morning.',
    category: 'domain_knowledge',
    tags: ['gardening', 'hobby'],
    importance: 0.3,
    source: 'user',
  });

  // Query retrieval for payments task
  const queryResult = memManager.retrieveRelevant('diagnose latency issue in payment architecture', {
    limit: 2,
  });
  assert(queryResult.length > 0, 'Retrieved relevant long-term memories');
  assert(queryResult[0].item.id === 'pay_sla', 'Most relevant memory is payment SLA');
  assert(queryResult[0].score > 0.4, 'Relevance score reflects high keyword and tag alignment');

  // Test 9.3: ContextBuilder memory entries format
  const memoryEntries = memManager.retrieveRelevantAsEntries('language preferences for typescript');
  assert(memoryEntries.length > 0, 'Converted to MemoryEntry[] format');
  assert(memoryEntries[0].id === 'pref_lang', 'Matched user language preference');
  assert(memoryEntries[0].source === 'user_profile', 'Category mapped to user_profile source');

  // Test 9.4: Task Context Assembly
  const taskCtxMem = memManager.getContextForTask('Audit payments latency', {
    maxTokens: 1000,
    maxMemoryEntries: 3,
  });
  assert(taskCtxMem.shortTermMessages.length === 2, 'Short-term messages included in task context');
  assert(taskCtxMem.relevantMemories.length > 0, 'Relevant memories included in task context');
  assert(taskCtxMem.tokenEstimate > 0, 'Token estimate provided');

  // Test 9.5: State serialization and restore
  const serialized = memManager.exportState();
  assert(serialized.version === 1, 'Serialized version 1');
  assert(serialized.shortTerm.length === 2, 'Serialized short-term count');
  assert(serialized.longTerm.length === 3, 'Serialized long-term count');

  const restoredManager = new MemoryManager();
  restoredManager.importState(serialized);
  assert(restoredManager.getRecentMessages().length === 2, 'Restored short-term state successfully');
  assert(restoredManager.getLongTermMemory('pay_sla') !== undefined, 'Restored long-term memory item successfully');

  console.log(`\n========================================`);
  console.log(`SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});
