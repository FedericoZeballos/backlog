import type { FastifyInstance } from 'fastify';
import { AISettingsInput, ApplyProposalInput, IdParam, ProposeInput, RecommendInput, TurnInput } from '@backlog/shared';
import { authenticate } from '../../lib/auth';
import { getSettings, providerStatus, saveSettings } from './providers';
import { applyProposal, getConversation, propose, recommend, rejectProposal, runTurn } from './service';

// Model calls are slow and may cost money: limit how often they can be triggered.
const aiRateLimit = { rateLimit: { timeWindow: '1 minute' } };

export async function aiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/ai/status', async (req) => providerStatus(await getSettings(req.user.id)));

  app.get('/ai/settings', async (req) => getSettings(req.user.id));
  app.put('/ai/settings', async (req) => saveSettings(req.user.id, AISettingsInput.parse(req.body)));

  app.get('/ai/nodes/:id/conversation', async (req) => ({
    conversation: await getConversation(req.user.id, IdParam.parse(req.params).id),
  }));

  app.post('/ai/nodes/:id/turn', { config: aiRateLimit }, async (req) => ({
    conversation: await runTurn(req.user.id, IdParam.parse(req.params).id, TurnInput.parse(req.body ?? {}).message || undefined),
  }));

  app.post('/ai/nodes/:id/propose', { config: aiRateLimit }, async (req) => ({
    conversation: await propose(req.user.id, IdParam.parse(req.params).id, ProposeInput.parse(req.body ?? {}).mode),
  }));

  app.post('/ai/proposals/:id/apply', async (req) => ({
    conversation: await applyProposal(req.user.id, IdParam.parse(req.params).id, ApplyProposalInput.parse(req.body ?? {})),
  }));

  app.post('/ai/proposals/:id/reject', async (req) => ({
    conversation: await rejectProposal(req.user.id, IdParam.parse(req.params).id),
  }));

  app.post('/ai/recommend', { config: aiRateLimit }, async (req) => ({
    recommendation: await recommend(req.user.id, RecommendInput.parse(req.body).date),
  }));
}
