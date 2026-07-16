export class Sandbox {
  constructor(config = {}) {
    this.resourceLimits = {
      maxMemoryMb: config.maxMemoryMb || 256,
      maxCpuMs: config.maxCpuMs || 5000,
      maxNetworkCalls: config.maxNetworkCalls || 10,
      maxFileOps: config.maxFileOps || 20,
      allowedHosts: config.allowedHosts || [],
      blockedPaths: config.blockedPaths || ['/etc', '/sys', '/proc', '/root', '.ssh', '.env'],
    };
    this.sessions = new Map();
  }

  createSession(agentId, permissions = {}) {
    const sessionId = `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const session = {
      id: sessionId,
      agentId,
      startedAt: Date.now(),
      permissions: {
        canReadFiles: permissions.canReadFiles || false,
        canWriteFiles: permissions.canWriteFiles || false,
        canNetwork: permissions.canNetwork || false,
        canExecProcess: permissions.canExecProcess || false,
        canAccessDb: permissions.canAccessDb || false,
        allowedDirs: permissions.allowedDirs || [],
        allowedApis: permissions.allowedApis || [],
      },
      usage: {
        memoryMb: 0,
        cpuMs: 0,
        networkCalls: 0,
        fileOps: 0,
        actionsExecuted: 0,
      },
      violations: [],
      state: 'active', // 'active' | 'suspended' | 'terminated'
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  checkPermission(sessionId, operation) {
    const session = this.sessions.get(sessionId);
    if (!session) return { allowed: false, reason: 'session_not_found' };
    if (session.state !== 'active') return { allowed: false, reason: `session_${session.state}` };

    const { type, target } = operation;

    if (type === 'file_read') {
      if (!session.permissions.canReadFiles) {
        this._recordViolation(session, 'file_read_denied', target);
        return { allowed: false, reason: 'file_read_not_permitted' };
      }
      if (this._isBlockedPath(target)) {
        this._recordViolation(session, 'blocked_path', target);
        return { allowed: false, reason: 'path_blocked', path: target };
      }
      if (session.permissions.allowedDirs.length > 0) {
        const inAllowed = session.permissions.allowedDirs.some(d => target.startsWith(d));
        if (!inAllowed) {
          this._recordViolation(session, 'outside_allowed_dirs', target);
          return { allowed: false, reason: 'outside_allowed_directory' };
        }
      }
      if (session.usage.fileOps >= this.resourceLimits.maxFileOps) {
        return { allowed: false, reason: 'file_ops_limit_reached' };
      }
      session.usage.fileOps++;
      return { allowed: true };
    }

    if (type === 'file_write') {
      if (!session.permissions.canWriteFiles) {
        this._recordViolation(session, 'file_write_denied', target);
        return { allowed: false, reason: 'file_write_not_permitted' };
      }
      if (this._isBlockedPath(target)) {
        this._recordViolation(session, 'blocked_path_write', target);
        return { allowed: false, reason: 'path_blocked', path: target };
      }
      if (session.usage.fileOps >= this.resourceLimits.maxFileOps) {
        return { allowed: false, reason: 'file_ops_limit_reached' };
      }
      session.usage.fileOps++;
      return { allowed: true };
    }

    if (type === 'network') {
      if (!session.permissions.canNetwork) {
        this._recordViolation(session, 'network_denied', target);
        return { allowed: false, reason: 'network_not_permitted' };
      }
      if (this.resourceLimits.allowedHosts.length > 0) {
        const hostAllowed = this.resourceLimits.allowedHosts.some(h => target.includes(h));
        if (!hostAllowed) {
          this._recordViolation(session, 'host_not_allowed', target);
          return { allowed: false, reason: 'host_not_allowed', host: target };
        }
      }
      if (session.usage.networkCalls >= this.resourceLimits.maxNetworkCalls) {
        return { allowed: false, reason: 'network_limit_reached' };
      }
      session.usage.networkCalls++;
      return { allowed: true };
    }

    if (type === 'exec') {
      if (!session.permissions.canExecProcess) {
        this._recordViolation(session, 'exec_denied', target);
        return { allowed: false, reason: 'exec_not_permitted' };
      }
      return { allowed: true };
    }

    if (type === 'db') {
      if (!session.permissions.canAccessDb) {
        this._recordViolation(session, 'db_denied', target);
        return { allowed: false, reason: 'db_not_permitted' };
      }
      return { allowed: true };
    }

    return { allowed: false, reason: 'unknown_operation_type' };
  }

  _isBlockedPath(path) {
    return this.resourceLimits.blockedPaths.some(blocked => path.includes(blocked));
  }

  _recordViolation(session, type, target) {
    session.violations.push({ type, target, timestamp: Date.now() });

    if (session.violations.length >= 3) {
      session.state = 'suspended';
    }
  }

  suspendSession(sessionId, reason) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = 'suspended';
      session.suspendReason = reason;
    }
  }

  terminateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = 'terminated';
      session.terminatedAt = Date.now();
    }
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }
}
