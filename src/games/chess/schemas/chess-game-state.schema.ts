import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PieceModel } from '@games/chess/interfaces/PieceModel';

export type ChessGameStateDocument = ChessGameState & Document;

@Schema()
export class ChessGameState {
  @Prop({ required: true })
  players: string[];

  @Prop({ require: true, unique: true })
  roomId: string;

  @Prop({ require: true })
  turn: number;

  @Prop({ require: true })
  board: PieceModel[][];
}

export const ChessGameStateSchema =
  SchemaFactory.createForClass(ChessGameState);
