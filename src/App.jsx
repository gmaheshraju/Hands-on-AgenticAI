import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import PageTransition from './components/PageTransition';
import Home from './pages/Home';
import DatabaseSelection from './pages/DatabaseSelection';
import RateLimiter from './pages/RateLimiter';
import Caching from './pages/Caching';
import MessageQueues from './pages/MessageQueues';
import Scaling from './pages/Scaling';
import EventDriven from './pages/EventDriven';
import StateMachines from './pages/StateMachines';
import ApiDesign from './pages/ApiDesign';
import Resilience from './pages/Resilience';
import Observability from './pages/Observability';
import AuthArchitecture from './pages/AuthArchitecture';
import DeploymentStrategies from './pages/DeploymentStrategies';
import Concurrency from './pages/Concurrency';
import DistributedSystems from './pages/DistributedSystems';
import Blog from './pages/Blog';
import AgentSystemDesign from './pages/blog/AgentSystemDesign';
import AgentMemory from './pages/blog/AgentMemory';
import AgentHarness from './pages/blog/AgentHarness';
import MultiAgentSystems from './pages/blog/MultiAgentSystems';
import RagDeepDive from './pages/blog/RagDeepDive';
import LlmOps from './pages/blog/LlmOps';
import AiGuardrails from './pages/blog/AiGuardrails';
import EvalEngineering from './pages/blog/EvalEngineering';
import FineTuningVsRag from './pages/blog/FineTuningVsRag';
import ToolUseFunctionCalling from './pages/blog/ToolUseFunctionCalling';
import CostLatencyEngineering from './pages/blog/CostLatencyEngineering';
import AiUxPatterns from './pages/blog/AiUxPatterns';
import ResponsibleAi from './pages/blog/ResponsibleAi';
import ForwardDeployedEngineering from './pages/blog/ForwardDeployedEngineering';
import ContextEngineering from './pages/blog/ContextEngineering';

export default function App() {
  return (
    <Layout>
      <PageTransition>
      <Routes>
        <Route path="/" element={<Blog />} />
        <Route path="/home" element={<Home />} />
        <Route path="/database-selection" element={<DatabaseSelection />} />
        <Route path="/rate-limiter" element={<RateLimiter />} />
        <Route path="/caching" element={<Caching />} />
        <Route path="/message-queues" element={<MessageQueues />} />
        <Route path="/scaling" element={<Scaling />} />
        <Route path="/event-driven" element={<EventDriven />} />
        <Route path="/state-machines" element={<StateMachines />} />
        <Route path="/api-design" element={<ApiDesign />} />
        <Route path="/resilience" element={<Resilience />} />
        <Route path="/observability" element={<Observability />} />
        <Route path="/auth" element={<AuthArchitecture />} />
        <Route path="/deployment" element={<DeploymentStrategies />} />
        <Route path="/concurrency" element={<Concurrency />} />
        <Route path="/distributed-systems" element={<DistributedSystems />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/ai-agent-system-design" element={<AgentSystemDesign />} />
        <Route path="/blog/agent-memory-architecture" element={<AgentMemory />} />
        <Route path="/blog/agent-harness-loop-engineering" element={<AgentHarness />} />
        <Route path="/blog/multi-agent-systems" element={<MultiAgentSystems />} />
        <Route path="/blog/rag-pipeline-deep-dive" element={<RagDeepDive />} />
        <Route path="/blog/llm-ops" element={<LlmOps />} />
        <Route path="/blog/ai-guardrails" element={<AiGuardrails />} />
        <Route path="/blog/evaluation-engineering" element={<EvalEngineering />} />
        <Route path="/blog/fine-tuning-vs-rag" element={<FineTuningVsRag />} />
        <Route path="/blog/tool-use-function-calling" element={<ToolUseFunctionCalling />} />
        <Route path="/blog/cost-latency-engineering" element={<CostLatencyEngineering />} />
        <Route path="/blog/ai-ux-patterns" element={<AiUxPatterns />} />
        <Route path="/blog/responsible-ai" element={<ResponsibleAi />} />
        <Route path="/blog/forward-deployed-engineering" element={<ForwardDeployedEngineering />} />
        <Route path="/blog/context-engineering" element={<ContextEngineering />} />
      </Routes>
      </PageTransition>
    </Layout>
  );
}
