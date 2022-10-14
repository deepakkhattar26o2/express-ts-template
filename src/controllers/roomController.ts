import { User, Room, Role } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import prisma from "../../prismaClient";
import { authDetails, CurrentUser } from "./authController";
import requestValidator from "../Tools/validator";

const getRooms = async (req: Request, res: Response) => {
  var rooms: Room[] = [];
  if (req.query.user) {
    rooms = await prisma.room.findMany({
      where: { hostId: Number(req.query.user) },
    });
  } else if (req.query.search) {
    rooms = await prisma.room.findMany({
      where: {
        OR: [
          { roomName: { contains: String(req.query.search) } },
          { topics: { has: String(req.query.search) } },
        ],
      },
    });
  } else {
    rooms = await prisma.room.findMany();
  }
  return res.status(200).json({ rooms: rooms });
};

const deleteRoom = async (req: Request, res: Response) => {
  if (!req.body.roomId) {
    return res.status(500).json({ message: "Missing Room ID!" });
  }
  const roomId: number = req.body.roomId;
  const currUser: CurrentUser = authDetails(req);
  let room: Room | null = await prisma.room.findFirst({
    where: { id: roomId },
  });
  if (!room) {
    return res.status(409).json({ message: "Room Doesn't Exist!" });
  }
  if (room.hostId != currUser.id && currUser.role == Role.USER) {
    return res
      .status(409)
      .json({ message: "Only Admin can perform this action!" });
  }
  await prisma.room.delete({ where: { id: roomId } });
  return res.status(200).json({ message: "Room deleted Successfully" });
};

interface createRoomBody {
  roomName: string;
  description?: string;
  topics: string;
}
const createRoom = async (req: Request, res: Response, next : NextFunction) => {
  const currUser: CurrentUser = authDetails(req);
  // const fields: string[] = ["roomName", "topics"];
  // const validator: [boolean, string] = requestValidator(req, fields);
  // console.log(validator);
  // if (!validator[0]) {
  //   return res.status(409).json({ message: `Missing ${validator[1]}` });
  // }
  const body: any = req.query;
  if(!body.roomName || !body.topics){
    return res.status(409).json({message : "Missing required keys!"})
  }
  let topics = body.topics.replace(/\s/g, "").split(",");
  prisma.room
    .create({
      data: {
        roomName: body.roomName,
        description: body.description,
        hostId: currUser.id,
        topics: topics,
      },
      include: {
        host: {
          select: {
            id: true,
            userName: true,
          },
        },
        messages: true,
        members: {
          select: {
            id: true,
            userName: true,
          },
        },
      },
    })
    .then((roomData: Room) => {
      req.query.attachment = "room-"+String(roomData.id)
      req.query.obj = JSON.stringify(roomData);
      next()
    })
    .catch((err: Error) => {
      return res.status(500).json({ message: err.message });
    });
};
interface joinRoomBody {
  roomId: number;
}
const joinRoom = async (req: Request, res: Response) => {
  const fields: string[] = ["roomId"];
  const validator: [boolean, string] = requestValidator(req, fields);
  if (!validator[0]) {
    return res.status(409).json({ message: `Missing ${validator[1]}` });
  }
  const body: joinRoomBody = req.body;
  const currUser: CurrentUser = authDetails(req);
  prisma.room.update({
    where: { id: body.roomId },
    include : {
      members : true
    },
    data: {
      members: {
        connect: [{ id: currUser.id }]
      },
    },
  }).then((room : Room)=>{
    return res.status(200).json({room : room})
  }).catch((err : Error)=>{
    return res.status(500).json({message : err.message})
  })

};
const leaveRoom = (req: Request, res: Response) => {
  const fields: string[] = ["roomId"];
  const validator: [boolean, string] = requestValidator(req, fields);
  if (!validator[0]) {
    return res.status(409).json({ message: `Missing ${validator[1]}` });
  }
  const body: joinRoomBody = req.body;
  const currUser: CurrentUser = authDetails(req);
  prisma.room
    .update({
      where: {
        id: body.roomId,
      },
      data: {
        members: {
          disconnect: [{ id: currUser.id }],
        },
      },
    })
    .then((room: Room | null) => {
      return res.status(200).json({ room: room, user: currUser });
    })
    .catch((err: Error) => {
      return res.status(500).json({ message: err.message });
    });
};
const removeMember = async (req : Request, res : Response)=>{
  const body : {roomId : number, memberId : number} = req.body;
  const currUser : CurrentUser = authDetails(req)
  let room : Room | null = await prisma.room.findFirst({where : {id : body.roomId, members : {some : {id : body.memberId}}}})
  if(!room){
    return res.status(409).json({message : "room not found!"})
  }
  if(room.hostId!=currUser.id){
    return res.status(409).json({message : "you cannot remove any member!"})
  }
  prisma.room.update(
    {where : {
      id : room.id
    },
    data:{
      members :{
        disconnect : [{id : body.memberId}]
      }
    }
  }
  ).then(
    (updatedRoom : Room)=>{return res.status(200).json({updatedRoom : updatedRoom})}
  ).catch(
    (err : Error)=>{return res.status(500).json({message : err.message})}
  )
}
export { getRooms, createRoom, joinRoom, leaveRoom, deleteRoom, removeMember };