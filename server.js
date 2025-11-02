const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const CHARACTERS = [
  {name:"Ardilla Roja", img:"ardilla.png", maxHealth:100, special:"Nuez"},
  {name:"Ratón", img:"raton.png", maxHealth:100, special:"Ataque doble"},
  {name:"Capibara", img:"capibara.png", maxHealth:100, special:"Meditación"}
];

let players = [];
let queue = [];
let gameStarted = false;

// =================== CONEXIÓN ===================
io.on("connection", socket=>{
  const newPlayer = {id:socket.id, name:"Jugador", health:100, charIndex:players.length%CHARACTERS.length, specialReady:false, streak:0};
  players.push(newPlayer);

  io.emit("updatePlayerList", players.map(p=>({id:p.id, name:p.name})));

  socket.on("startGame", ()=>{
    if(gameStarted) return;
    gameStarted=true;
    assignTeams();
  });

  socket.on("answer", data=>{
    handleAnswer(data.playerId, data.answer);
  });

  socket.on("useSpecial", data=>{
    useSpecial(data.playerId);
  });

  socket.on("disconnect", ()=>{
    players = players.filter(p=>p.id!==socket.id);
    io.emit("updatePlayerList", players.map(p=>({id:p.id, name:p.name})));
  });
});

// =================== EQUIPOS ALEATORIOS ===================
function assignTeams(){
  // Para este demo solo uno a uno vs otro
  if(players.length<2){
    // asignar bots si faltan jugadores
    while(players.length<2){
      players.push({id:"bot"+Math.random(), name:"Bot", health:100, charIndex:Math.floor(Math.random()*CHARACTERS.length), specialReady:false, streak:0});
    }
  }
  startBattle(players[0], players[1]);
}

// =================== BATALLA ===================
let currentQIndex=0;
const QUESTIONS = [
  { q: "¿Qué orden de mamíferos es el más diverso del planeta?", options: ["Carnivora", "Rodentia", "Chiroptera", "Primates"], correct: 1 },
  { q: "¿Cuántas especies aproximadas de roedores existen?", options: ["500", "1.200", "2.050", "4.000"], correct: 2 },
  { q: "¿En qué continente no se encuentran los roedores de forma natural?", options: ["Asia", "Oceanía", "África", "Antártida"], correct: 3 },
  { q: "¿Cuál de los siguientes animales NO pertenece al orden Rodentia?", options: ["Hámster", "Conejillo de Indias", "Murciélago", "Capibara"], correct: 2 },
  { q: "¿Qué característica dental distingue a los roedores?", options: ["Incisivos curvos y puntiagudos", "Dientes de crecimiento continuo", "Presencia de caninos desarrollados", "Falta total de premolares"], correct: 1 },
  { q: "¿Qué espacio vacío se encuentra entre los incisivos y los molares?", options: ["Arco cigomático", "Diastema", "Conducto dental", "Cavidad bucal"], correct: 1 },
  { q: "El capibara puede alcanzar un peso superior a:", options: ["10 kg", "25 kg", "60 kg", "100 kg"], correct: 2 },
  { q: "Los bigotes o vibrisas en los roedores sirven principalmente para:", options: ["Regular la temperatura corporal", "Detectar vibraciones y orientarse", "Masticar mejor los alimentos", "Almacenar grasa"], correct: 1 },
  { q: "¿Qué tipo de dieta presentan la mayoría de los roedores?", options: ["Exclusivamente herbívora", "Exclusivamente carnívora", "Omnívora", "Frugívora"], correct: 2 },
  { q: "¿Cuál de estos roedores puede capturar peces?", options: ["Rata", "Puercoespín", "Ardilla voladora", "Capibara"], correct: 0 },
  { q: "¿Qué característica reproductiva es común en roedores?", options: ["Gestación prolongada", "Camadas pequeñas y únicas", "Reproducción frecuente con muchas crías", "Huevos con cáscara blanda"], correct: 2 },
  { q: "En algunas especies, la vagina permanece cerrada cuando:", options: ["Están preñadas", "No están en época reproductiva", "Amamantan", "Cambian de pelaje"], correct: 1 },
  { q: "¿Qué roedor tiene crías muy desarrolladas al nacer?", options: ["Ratón", "Hámster", "Cobayo", "Jerbo"], correct: 2 },
  { q: "¿Cuál es una función ecológica destacada de los roedores?", options: ["Predar sobre mamíferos grandes", "Dispersar semillas", "Fijar nitrógeno en el suelo", "Controlar hongos"], correct: 1 },
  { q: "¿Qué papel cumplen los roedores como 'ingenieros del ecosistema'?", options: ["Modifican el clima", "Airean y remueven el suelo al excavar", "Controlan incendios naturales", "Polinizan árboles tropicales"], correct: 1 },
  { q: "Los roedores son fundamentales en las cadenas tróficas porque:", options: ["Son grandes depredadores", "Compiten con aves y reptiles", "Constituyen presas de muchos carnívoros", "Evitan la propagación de plantas"], correct: 2 },
  { q: "¿Por qué se consideran bioindicadores?", options: ["Por su longevidad", "Por su coloración", "Porque reflejan el estado de los ecosistemas", "Porque migran largas distancias"], correct: 2 },
  { q: "El orden Rodentia pertenece al clado:", options: ["Xenarthra", "Laurasiatheria", "Glires", "Afrotheria"], correct: 2 },
  { q: "¿Con qué otro orden comparten el clado Glires?", options: ["Lagomorpha", "Carnivora", "Primates", "Chiroptera"], correct: 0 },
  { q: "Los primeros roedores aparecieron hace aproximadamente:", options: ["250 millones de años", "100 millones de años", "65 millones de años", "10 millones de años"], correct: 2 },
  { q: "¿Qué evento marcó el surgimiento de los primeros roedores?", options: ["Formación de los continentes", "Extinción de los dinosaurios", "Aparición del Homo sapiens", "Glaciación del Pleistoceno"], correct: 1 },
  { q: "El probable ancestro común de los roedores fue:", options: ["Un primate arborícola", "Un marsupial", "Un mamífero insectívoro nocturno", "Un reptil ovíparo"], correct: 2 },
  { q: "¿En qué continentes se diversificaron ampliamente los roedores durante el Eoceno y Oligoceno?", options: ["África y Oceanía", "Asia y Sudamérica", "Europa y Norteamérica", "Oceanía y Europa"], correct: 1 },
  { q: "¿Qué subfamilia de roedores muestra una radiación adaptativa en Sudamérica?", options: ["Murinae", "Sigmodontinae", "Sciurinae", "Caviinae"], correct: 1 },
  { q: "Los Sciuromorfos incluyen principalmente:", options: ["Ardillas y lirones", "Ratas y ratones", "Puercoespines y capibaras", "Jerbos y tuzas"], correct: 0 },
  { q: "Los Myomorfos comprenden familias como:", options: ["Muridae y Cricetidae", "Hystricidae y Caviidae", "Castoridae y Heteromyidae", "Anomaluridae y Pedetidae"], correct: 0 },
  { q: "Los Sciurognatos tienen el ángulo mandibular:", options: ["Desviado lateralmente", "Alineado con los incisivos", "En forma de gancho", "En posición ventral"], correct: 1 },
  { q: "Los Histricognatos presentan el ángulo mandibular:", options: ["En línea recta", "Reducido", "Proyectado lateralmente", "Fijo al cráneo"], correct: 2 },
  { q: "¿Qué especie muestra cuidado parental cooperativo?", options: ["Puercoespín", "Rata topo desnuda", "Marmotas", "Jerbo"], correct: 2 },
  { q: "El ratón canguro (Dipodomys spp.) destaca por:", options: ["Su vuelo planeador", "Su reflejo ultrarrápido frente a depredadores", "Su capacidad de almacenar agua", "Su comportamiento subterráneo"], correct: 1 },
  { q: "¿Qué función cumplen las bolsas en las mejillas de algunos roedores?", options: ["Regular la temperatura", "Guardar alimento", "Emitir sonidos", "Transportar crías"], correct: 1 },
  { q: "¿Qué característica del pelaje es típica de las chinchillas?", options: ["Ausencia total de pelo", "Pelaje muy denso y suave", "Pelaje espinoso", "Escamas córneas"], correct: 1 },
  { q: "¿Qué relación tienen los roedores con los humanos?", options: ["Ninguna", "Solo negativa, como plagas", "Negativa y positiva, según la especie", "Exclusivamente simbiótica"], correct: 2 },
];

function startBattle(p1,p2){
  queue=[p1,p2];
  sendQuestion();
}

function sendQuestion(){
  const q = QUESTIONS[currentQIndex % QUESTIONS.length];
  queue.forEach(p=>{ io.to(p.id).emit("newQuestion", q); });
  currentQIndex++;
}

// =================== RESPUESTA ===================
function handleAnswer(playerId, ans){
  const p = players.find(p=>p.id===playerId);
  const rival = players.find(pl=>pl.id!==playerId);
  if(!p || !rival) return;

  const question = QUESTIONS[(currentQIndex-1) % QUESTIONS.length];
  if(ans===question.answer){
    p.streak++;
    if(p.streak>=3){ p.specialReady=true; p.streak=0; io.to(p.id).emit("log","¡Habilidad especial lista!"); }
    dealDamage(p,rival,10,"normal");
  } else {
    p.streak=0;
    dealDamage(rival,p,10,"normal");
  }

  sendQuestion();
}

// =================== DAÑO ===================
function dealDamage(attacker, defender, dmg,type){
  defender.health-=dmg;
  if(defender.health<0) defender.health=0;
  io.to(attacker.id).emit("updateBattle",{player:attacker, attack:{type, player:attacker.charIndex}});
  io.to(defender.id).emit("updateBattle",{player:defender, attack:{type, player:attacker.charIndex}});
  io.emit("log", `${attacker.name} atacó a ${defender.name} por ${dmg} de daño.`);
}

// =================== USO DE ESPECIAL ===================
function useSpecial(playerId){
  const p = players.find(p=>p.id===playerId);
  const rival = players.find(pl=>pl.id!==playerId);
  if(!p || !rival) return;
  p.specialReady=false;

  switch(CHARACTERS[p.charIndex].name){
    case "Ardilla Roja": dealDamage(p,rival,25,"special"); break;
    case "Ratón": dealDamage(p,rival,20,"special"); break;
    case "Capibara": p.health+=20; if(p.health>CHARACTERS[p.charIndex].maxHealth) p.health=CHARACTERS[p.charIndex].maxHealth;
                      io.to(p.id).emit("log","¡Capibara recuperó salud!"); break;
  }

  io.to(p.id).emit("updateBattle",{player:p, attack:{type:"special", player:p.charIndex, charName:CHARACTERS[p.charIndex].name}});
  io.to(rival.id).emit("updateBattle",{player:rival, attack:{type:"special", player:p.charIndex, charName:CHARACTERS[p.charIndex].name}});
}

// =================== SERVIDOR ===================
server.listen(3000, ()=>console.log("Servidor corriendo en http://localhost:3000"));
