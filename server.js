const express=require("express");
const app=express();
const http=require("http").createServer(app);
const io=require("socket.io")(http);
const PORT=process.env.PORT || 1000;

app.use(express.static(__dirname));

const characters=[
{name:"Ardilla Roja",img:"Ardilla roja.png",attackImg:"Ardilla_ataque.png",special:"nuez"},
{name:"Ratón",img:"Raton.png",attackImg:"Raton_ataque.png",special:"doble"},
{name:"Capibara",img:"Capibara.png",attackImg:"Capibara_ataque.png",special:"meditar"}
];

const rooms={};

io.on("connection",socket=>{
console.log("Jugador conectado",socket.id);

socket.on("createRoom",hostName=>{
const roomId=Math.random().toString(36).substring(2,7).toUpperCase();
rooms[roomId]={hostId:socket.id,players:[],teams:{A:[],B:[]},round:0};
socket.join(roomId); socket.emit("roomCreated",{roomId});
});

socket.on("joinRoom",data=>{
const {roomId,name}=data; const room=rooms[roomId];
if(!room){ socket.emit("errorMsg","Sala no existe"); return; }
const character=characters[Math.floor(Math.random()*characters.length)];
const player={id:socket.id,name,character,score:0,health:100};
room.players.push(player); socket.join(roomId);
io.to(room.hostId).emit("updateHostPanel",room);
});

socket.on("startRound",roomId=>{
const room=rooms[roomId]; if(!room) return;
if(room.round===0){
const shuffled=[...room.players].sort(()=>Math.random()-0.5);
room.teams.A=[]; room.teams.B=[];
shuffled.forEach((p,i)=>i%2===0?room.teams.A.push(p):room.teams.B.push(p));
const maxLen=Math.max(room.teams.A.length,room.teams.B.length);
while(room.teams.A.length<maxLen) room.teams.A.push({id:"botA"+room.teams.A.length,name:"BotA",character:characters[Math.floor(Math.random()*characters.length)],score:0,health:100});
while(room.teams.B.length<maxLen) room.teams.B.push({id:"botB"+room.teams.B.length,name:"BotB",character:characters[Math.floor(Math.random()*characters.length)],score:0,health:100});
}
room.round++;
io.to(room.hostId).emit("roundStarted",room);
const battles=[];
for(let i=0;i<room.teams.A.length;i++) battles.push({player:room.teams.A[i],enemy:room.teams.B[i]});
battles.forEach(b=>io.to(b.player.id).emit("startBattle",b));
});
});

http.listen(PORT,()=>console.log("Server escuchando en puerto",PORT));
