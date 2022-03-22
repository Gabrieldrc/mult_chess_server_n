import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

import { GameFactoryService } from '@games/services/game-factory/game-factory.service';
import { RoomService } from '@utils/room/room.service';
import IWSResponse from '@events/classes/IWSResponse';
import { ChessGamesStateService } from '@games/services/chess-games-state/chess-games-state.service';
import ItDidNotMoveException from '@games/exceptions/ItDidNotMoveException';
import { Position2D } from '@utils/interfaces/position2-d.interface';
import ChessGameState from '@games/chess/interfaces/ChessGameState';
import Chess from '@games/chess/chess';

@WebSocketGateway({ namespace: '/game/chess/' })
export class ChessGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('AppGateway');

  constructor(
    private gameFactory: GameFactoryService,
    private roomService: RoomService,
    private gameStateService: ChessGamesStateService,
  ) {}

  @SubscribeMessage('newGame')
  async handleNewGame(@ConnectedSocket() client: Socket) {
    const response = new IWSResponse();
    let gameState: ChessGameState;

    const game = this.gameFactory.getGame('chess');
    game.newGame();
    game.addPlayer(client.id);

    try {
      gameState = await this.gameStateService.createGameState(game);
      this.roomService.setRoom(client.id, gameState.roomId);
      client.join(gameState.roomId);
    } catch (error) {
      this.logger.error(error);

      response.setOk(false).setData({ error: error });
      return { event: 'error', data: response };
    }

    const data = {
      room: gameState.roomId,
      playerNumber: 1,
      playerId: client.id,
    };
    response.setOk(true).setData(data);
    return { event: 'newGame', data: response };
  }

  @SubscribeMessage('play')
  async handlePlay(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: Position2D[],
  ) {
    const [from, to] = data;

    const response = new IWSResponse();

    const room = this.roomService.getRoom(client.id);

    let game: Chess;
    try {
      game = await this.gameStateService.getGame(room);

      const itMoved = game.move(from.i, from.j, to.i, to.j);
      if (!itMoved) {
        throw new ItDidNotMoveException();
      }

      await this.gameStateService.updateGameState({
        roomId: room,
        ...game.getState(),
      });
    } catch (error) {
      this.logger.error('Error::chess->play', error.message);
      response.setOk(false).setData({ error: error });
      return { event: 'error', data: response };
    }

    response.setOk(true).setData({ ...game.getBoardData() });
    this.server.to(room).emit('gameStateUpdate', response);
  }

  @SubscribeMessage('joinGame')
  async handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() room: string,
  ) {
    const response = new IWSResponse();
    const data = {};

    this.roomService.setRoom(client.id, room);

    try {
      const game = await this.gameStateService.getGame(room);

      if (game.addPlayer(client.id)) {
        data['playerNumber'] = game.getPlayers().indexOf(client.id) + 1;
      }

      client.join(room);
      this.gameStateService.updateGameState({
        roomId: room,
        ...game.getState(),
      });
    } catch (error) {
      this.logger.error(error);
      response.setOk(false).setData({ error: error });
      return { event: 'error', data: response };
    }

    data['room'] = room;
    data['playerId'] = client.id;

    response.setOk(true).setData(data);
    return { event: 'newGame', data: response };
  }

  afterInit(server: Server) {
    this.logger.log('Ches Gateway Init');
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected to ChessGateway: ${client.id}`);
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected to ChessGateway: ${client.id}`);
  }
}
