/**
 * WebSocket Server for Aeon Dashboard
 * Provides real-time updates to the dashboard frontend
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface WebSocketMessage {
  type: string;
  guildId?: string;
  data?: any;
}

export class AeonWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, Set<WebSocket>> = new Map(); // guildId -> Set of clients

  constructor(server: Server, port: number = 3001) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket client connected');

      ws.on('message', (message: string) => {
        try {
          const data: WebSocketMessage = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        this.removeClient(ws);
        console.log('WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.removeClient(ws);
      });
    });

    console.log(`WebSocket server running on port ${port}`);
  }

  private handleMessage(ws: WebSocket, message: WebSocketMessage) {
    switch (message.type) {
      case 'subscribe_guild':
        if (message.guildId) {
          this.subscribeToGuild(ws, message.guildId);
        }
        break;

      case 'unsubscribe_guild':
        if (message.guildId) {
          this.unsubscribeFromGuild(ws, message.guildId);
        }
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private subscribeToGuild(ws: WebSocket, guildId: string) {
    if (!this.clients.has(guildId)) {
      this.clients.set(guildId, new Set());
    }
    this.clients.get(guildId)!.add(ws);
    ws.send(JSON.stringify({ type: 'subscribed', guildId }));
  }

  private unsubscribeFromGuild(ws: WebSocket, guildId: string) {
    const clients = this.clients.get(guildId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.clients.delete(guildId);
      }
    }
  }

  private removeClient(ws: WebSocket) {
    for (const [guildId, clients] of this.clients.entries()) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.clients.delete(guildId);
      }
    }
  }

  // Public methods to emit events to subscribed clients

  public emitAuditLog(guildId: string, auditLog: any) {
    this.broadcastToGuild(guildId, {
      type: 'audit_log',
      guildId,
      data: auditLog,
    });
  }

  public emitTicketUpdate(guildId: string, ticket: any) {
    this.broadcastToGuild(guildId, {
      type: 'ticket_update',
      guildId,
      data: ticket,
    });
  }

  public emitCommandExecuted(guildId: string, commandData: any) {
    this.broadcastToGuild(guildId, {
      type: 'command_executed',
      guildId,
      data: commandData,
    });
  }

  public emitSettingsUpdate(guildId: string, settings: any) {
    this.broadcastToGuild(guildId, {
      type: 'settings_update',
      guildId,
      data: settings,
    });
  }

  public emitCustomCommandUpdate(guildId: string, command: any) {
    this.broadcastToGuild(guildId, {
      type: 'custom_command_update',
      guildId,
      data: command,
    });
  }

  private broadcastToGuild(guildId: string, message: WebSocketMessage) {
    const clients = this.clients.get(guildId);
    if (!clients) return;

    const messageStr = JSON.stringify(message);
    const deadClients: WebSocket[] = [];

    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      } else {
        deadClients.push(ws);
      }
    });

    // Clean up dead connections
    deadClients.forEach((ws) => {
      clients.delete(ws);
    });

    if (clients.size === 0) {
      this.clients.delete(guildId);
    }
  }

  public getSubscribedGuilds(): string[] {
    return Array.from(this.clients.keys());
  }

  public getClientCount(guildId: string): number {
    return this.clients.get(guildId)?.size || 0;
  }
}
