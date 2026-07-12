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

export default function App() {
  return (
    <Layout>
      <PageTransition>
      <Routes>
        <Route path="/" element={<Home />} />
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
      </Routes>
      </PageTransition>
    </Layout>
  );
}
