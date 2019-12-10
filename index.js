const fs = require('fs');
var app = require('express')();
const https = require('https');

var server = https.createServer({ key: fs.readFileSync('privkey.pem'), cert: fs.readFileSync('cert.pem'), ca: fs.readFileSync('chain.pem'), requestCert: false, rejectUnauthorized: false },app);
server.listen(25561);
var io = require('socket.io').listen(server);




/*
const server = require('http').createServer();
const port = 25560;
const io = require('socket.io')(server);

// Listen for incoming connections
server.listen(port, (err) => {
    if (err) throw err
    console.log(`Listening on port ${port}`);
});
*/


function getDateTime() {

    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;

    var year = date.getFullYear();

    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;

    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;

    return year + ":" + month + ":" + day + ":" + hour + ":" + min + ":" + sec;

}


var players = []; // all connected players will be stored here
var clientId = 0; // unique ID for every client
var roomId = 0;
var bulletId = 0; //unique id for every bullet

class Player {
    constructor(data) {
        this.bullets = [];
        this.username = data.username;
        this.socket = data.socket;
        this.id = data.id;
        this.ready = 0; // player is not ready by default. this is for starting a lobby early

        this.x = data.x;
        this.y = data.y;
        this.room = undefined;
        this.s = data.s; //sliding
        this.h = data.h; //hurt
        this.d = data.d; //dead
        this.l = data.l; //On ladder
        this.r = data.r; //room
        this.w = data.w; //weapon
        this.a = 1; // alive/spectate
        this.e = data.e; //dabbing
        this.playersToCreate = []; //all players in this array will be sent to the client then destroyed(how violent!)
        this.bulletsToCreate = [];
        this.playersToDestroy = [];
        this.bulletsToDestroy = [];
        this.bulletsToAct = []; //action by bullets. act by idn
        this.deadPlayers = []; //dead players packet
        this.other = []; //other packet
    }

    toString() {
        return JSON.stringify(this, this.replacer);
    }

    replacer(key, value) {
        if (key == "socket" || key == "other" || key == "room" || key == "ready" || key == "bullets" || key == "playersToCreate" || key == "bulletsToCreate" || key == "deadPlayers" || key == "playersToDestroy" || key == "bulletsToDestroy" || key == "bulletsToAct") return undefined;
        else return value;
    }

    createSelfPositionPacket(){
      var packet = [];
      if(typeof this.room == "undefined")
        return undefined;
      for(let k in this.room.players){
        if(this.room.players[k] != undefined && this.room.players[k] != this && this.room.players[k].a == 1){
          packet.push(this.room.players[k].toString()); //concatenate all other players
        }
      }
      return packet;
    }

    addPlayerToCreate(player){
      if (player != undefined){
        this.playersToCreate.push(player);
      }
      return;
    }

    createPlayersToCreatePacket(){
      var packet = [];
      if(this.playersToCreate.length == 0){
        return undefined;
      }
      for(let k in this.playersToCreate){
        //console.log(`pushed ${this.playersToCreate[k].username} to ${this.username}`)
        packet.push(this.playersToCreate[k].toString());
      }
      this.playersToCreate = [];
      return packet;
    }

    addBulletsToCreate(bullet){
      if (bullet != undefined){
        //console.log(`bullet added`);
        this.bulletsToCreate.push(bullet);
      }
      return;
    }

    createBulletsToCreatePacket(){
      var packet = [];
      if(this.bulletsToCreate.length == 0){
        //console.log(`no bullets`);
        return undefined;
      }
      //console.log(`there indeed are bullets`);
      for(let k in this.bulletsToCreate){
        //console.log(`pushed ${this.bulletsToCreate[k].x} to ${this.username}`)
        packet.push(this.bulletsToCreate[k].toString());
      }
      this.bulletsToCreate = [];
      return packet;
    }
    addDeadPlayers(player){
      if (player != undefined){
        //console.log(`dead player added`);
        this.deadPlayers.push(player);
      }
      return;
    }
    createDeadPlayersPacket(){
      var packet = [];
      if(this.deadPlayers.length == 0){
        //console.log(`no bullets`);
        return undefined;
      }
      //console.log(`there indeed are dead players`);
      for(let k in this.deadPlayers){
        //console.log(`pushed ${this.deadPlayers[k].id} to ${this.username}`)
        packet.push(this.deadPlayers[k].toString());
      }
      this.deadPlayers = [];
      return packet;
    }
    addPlayerToDestroy(player){
      if (player != undefined && player != this){
        //console.log(`destroy player added`);
        this.playersToDestroy.push(player);
      }
      return;
    }
    createPlayersToDestroyPacket(){
      var packet = [];
      if(this.playersToDestroy.length == 0){
        //console.log(`no bullets`);
        return undefined;
      }
      //console.log(`there indeed are destroyable players`);
      for(let k in this.playersToDestroy){
        //console.log(`pushed a destroy player`)
        packet.push(this.playersToDestroy[k].toString());
      }
      this.playersToDestroy = [];
      return packet;
    }

    addBulletsToDestroy(bulletID){
      if (bulletID != undefined){
        //console.log(`destroy bullet added`);
        this.bulletsToDestroy.push(bulletID);
      }
      return;
    }
    createBulletsToDestroyPacket(){
      var packet = [];
      if(this.bulletsToDestroy.length == 0){
        //console.log(`no bullets`);
        return undefined;
      }
      //console.log(`there indeed are destroyable bullets`);
      for(let k in this.bulletsToDestroy){
        //console.log(`pushed a destroy bullet`)
        packet.push(this.bulletsToDestroy[k].toString());
      }
      this.bulletsToDestroy = [];
      return packet;
    }

    addBulletsToAct(bulletID){
      if (bulletID != undefined){
        //console.log(`destroy bullet added`);
        this.bulletsToAct.push(bulletID);
      }
      return;
    }
    createBulletsToActPacket(){
      var packet = [];
      if(this.bulletsToAct.length == 0){
        //console.log(`no bullets`);
        return undefined;
      }
      //console.log(`there indeed are destroyable bullets`);
      for(let k in this.bulletsToAct){
        //console.log(`pushed a destroy bullet`)
        packet.push(this.bulletsToAct[k].toString());
      }
      this.bulletsToAct = [];
      return packet;
    }
    addOther(data){
      if (data != undefined){
        //console.log(`destroy bullet added`);
        this.other.push(data);
      }
      return;
    }

    addOtherEmit(opcode, data){
      var packet = {};
      packet.op = opcode;
      packet.d = data; //data should already be toStringed.
      this.addOther(packet);
    }

    createOtherPacket(){
      var packet = [];
      if(this.other.length == 0){
        //console.log(`no bullets`);
        return undefined;
      }
      //console.log(`there indeed are destroyable bullets`);
      for(let k in this.other){
        //console.log(`pushed a destroy bullet`)
        packet.push(JSON.stringify(this.other[k]));
      }
      this.other = [];
      return packet;
    }
}

class Bullet {
    constructor(data) {
      this.x = undefined;
      this.y = undefined;
      this.dir = undefined;
      this.f = undefined;
      this.w = undefined;
      this.s = undefined;
      this.id = undefined;
      this.ids = bulletId++;
    }

    toString() {
        return JSON.stringify(this, this.replacer);
    }

    replacer(key, value) {
        //@source https://stackoverflow.com/questions/4910567/hide-certain-values-in-output-from-json-stringify
        // we don't need to send the socket object to the client
        if (false) return undefined;
        else return value;
    }
  }


class Level {
  constructor(id) {
    this.room = id;
  }

  toString() {
    return JSON.stringify(this);
  }
}

class Room {
  constructor() {
    this.id = roomId++;
    console.log(`Room created with ID "${this.id}"`);
    this.targetPlayers = 30;
    this.players = [];
    this.inProgress = false;
    this.winPosition = 0;
    this.totalPlayers = 0;
    this.targetReadyPercent = .55;
    this.lobbyTimerStarted = false;
    this.lobbyTimerLength = 90000; //how many ms until the game starts?
    this.lobbyTimerStart = undefined;
    this.bulletCreate = [];
    this.bulletDelete = [];
    this.level = new Level(Math.floor(100 + (Math.random() * 8)));
    //this.updateInterval = setInterval(this.sendPackets,100);
    this.startPackets();
  }
  broadcast(client, opcode, data){
    //console.log(`Broadcasting to room ${this.id}`);
    for(let p in this.players) {
      if(this.players[p] !== client){ //Make sure we aren't emitting to ourself
        var packet = {};
         //this.players[p].socket.emit(opcode,data);
         packet.op = opcode;
         packet.d = data; //data should already be toStringed.
         this.players[p].addOther(packet);
       }
    }
  }
  emit(opcode, data){
    for(let p in this.players) {
      var packet = {};
       //this.players[p].socket.emit(opcode,data);
       packet.op = opcode;
       packet.d = data; //data should already be toStringed.
       this.players[p].addOther(packet);
      }
    }

  addPlayerToList(player){
    player.ready = 0;
    if(this.lobbyTimerStarted){
      var data ={};
      data.timer = this.getLobbyTimer();
      player.addOtherEmit('lobby_timer',JSON.stringify(data));
    }
    //emit level info
    var data = {};
    data.level = this.level.room;
    player.addOtherEmit('room_info',JSON.stringify(data));

    for(let k in this.players){ //create new player for all other players
      this.players[k].addPlayerToCreate(player);
      player.addPlayerToCreate(this.players[k]);
    }

    this.players.push(player);
    if(!this.inProgress){
      this.updateReadyPercent();
    }
  }
  removePlayer(player){
      this.players.splice(this.players.indexOf(player), 1);
      if(this.players.length <= 0 && this != myServer.getCurrentRoom()){
        console.log(`Room ID ${this.id} deleted!`);
        delete this;
      }
      if(!this.inProgress){
        this.updateReadyPercent();
      }
  }
  updateRoomPlayers(){
    var emitData = {};
    var _alivePlayers = 0;
    for(let k in this.players){
      //console.log(`k.a = ${this.players[k].a}`);
      if(this.players[k].a === 1){
        _alivePlayers++;
      }
    }
    //console.log(`aliveplayers = ${_alivePlayers}`);
    emitData.t = this.totalPlayers; //total players at room start
    emitData.c = _alivePlayers; // current alive players
    if(!this.inProgress){
      this.updateReadyPercent();
    }
    this.emit('room_players', JSON.stringify(emitData));
  }
  updateReadyPercent(){
    var _readyNum = 0;
    for(let k in this.players){
      if(this.players[k].ready == 1)
        _readyNum++;
    }
    if(!this.inProgress && _readyNum > 0 && !this.lobbyTimerStarted){
      this.lobbyTimerStarted = true;
      this.startLobbyTimer();
      var data ={};
      data.timer = this.getLobbyTimer();
      this.emit('lobby_timer',JSON.stringify(data));
    }
    if(_readyNum == 0 && this.lobbyTimerStarted){
      this.stopLobbyTimer();
    }

    if(!this.inProgress && this.players.length > 0 && _readyNum/this.players.length >= this.targetReadyPercent){
      console.log("Room started early from ready.");
      myServer.startRoom(); //if there are enough readied up, start the room.
    } else {
      this.emit('ready_percent', _readyNum/this.players.length);
    }
  }
  startLobbyTimer(){
    console.log(`lobby timer has started`);
    var time = new Date();
    this.lobbyTimerStart = time.getTime();

    var self = this;
    this.lobbyTimer = setInterval(function(){
      myServer.startRoom();
      self.stopLobbyTimer();
    },self.lobbyTimerLength);
  }

  getLobbyTimer(){
    var time = new Date();
    return (this.lobbyTimerStart + this.lobbyTimerLength) - time.getTime();
  }
  stopLobbyTimer(){
    console.log(`lobby timer has stopped`);
    this.lobbyTimerStarted = false;
    clearInterval(this.lobbyTimer); //stop the setInterval stopLobbyTimer
    if(!this.inProgress){
      var data = {};
      data.timer = -1;
      this.emit('lobby_timer',JSON.stringify(data));
    }
  }
  startPackets(){
    var self = this;
    this.timer = setInterval(function(){
      self.sendPackets();
    },100);
  }
  createPositionPacket(){
    //console.log(`Creating Position packet`);
    var data = [];
    for(let k in this.players){
      data.push(this.players[k].toString());
    }
    return data;
  }
  sendPackets(){
    var self = this;
    //packet.p = self.createPositionPacket();
    for (let k in self.players){
      var packet = {};

      packet.p = self.players[k].createSelfPositionPacket(); //positions

      packet.cpo = self.players[k].createPlayersToCreatePacket(); //create other players
      packet.cbo = self.players[k].createBulletsToCreatePacket(); //bullet create other
      packet.dp = self.players[k].createDeadPlayersPacket(); //create dead players packet
      packet.dpo = self.players[k].createPlayersToDestroyPacket(); //destroy player other
      packet.dbo = self.players[k].createBulletsToDestroyPacket(); //destroy bullet other
      packet.abo = self.players[k].createBulletsToActPacket(); //act bullet other
      packet.o = self.players[k].createOtherPacket(); //other
      //if(packet.abo != undefined)
        //console.log(`act = ${JSON.stringify(packet.abo)}`);
      self.players[k].socket.emit('updateall',JSON.stringify(packet));
    }
    var time = new Date();
    //console.log(time.getSeconds());
    return 0;
  }
}


class Server {
  constructor() {
    this.rooms = [];
    this.currentRoom = new Room();
  }

  startRoom() {
    //var myLevel = new Level(Math.floor(100 + (Math.random() * 8)));
    //var myLevel = new Level(100);
    //this.currentRoom.emit('room_change', myLevel.toString());
    this.currentRoom.emit('room_change', this.currentRoom.level.toString());
    this.currentRoom.totalPlayers = this.currentRoom.players.length;
    this.currentRoom.inProgress = true;
    this.currentRoom.stopLobbyTimer(); //stop the timer

    console.log(`Game started in room ${this.currentRoom.id} with ${this.currentRoom.totalPlayers} players on stage ${this.currentRoom.level.room}`);
    this.rooms.push(this.currentRoom);
    this.currentRoom = new Room();
  }

  addPlayerToCurrentRoom(player) {
    //console.log(`adding player ${player.username} to room`);
    this.currentRoom.addPlayerToList(player);
  }
  getCurrentRoom(){
    //console.log(`got current room ID ${this.currentRoom.id}`);
    return this.currentRoom;
  }
  startByPlayerCount(){
    if(this.currentRoom.players.length >= this.currentRoom.targetPlayers){
      this.startRoom();
    }
  }
}

airman = new Level(100);
myServer = new Server();


io.sockets.on('connection', (client) => {
    var playerId = clientId++;
    var player;
    //var bullet;

    // This event will be trigered when the client request to join the game.
    // In this example project, it'll happen after you've entered your username on the client side
    client.on('create_player', (data) => {

        //if the player is already initialized and in a room, remove him from the room.
        if (typeof player != "undefined") {
          players.splice(players.indexOf(player), 1);
          delete player;
        }

        data = JSON.parse(data);
        player = new Player({
            socket: client,
            id: playerId,
            ready: 0,
            //room: activeRoom, //SERVER room, not game room
            username: data.username,
            x: 10,
            y: 10,
            s: 0, //sliding
            h: 0, //hurt
            d: 0, //dead
            l: 0, //On ladder
            r: -4, //room
            w: 0, //weapon
            e: 0, //dabbing
            a: 1 //alive, this is false if game over/spectating.
        });
        player.room = myServer.getCurrentRoom();
        //console.log(`Player ${player.username} added to room ${player.room}`);

        myServer.addPlayerToCurrentRoom(player);

        // Add to players list
        players.push(player);

        //myServer.currentRoom.updateReadyPercent();
        console.log(`Player "${player.username}", with ID: ${player.id} created for room ${player.room.id}! ${getDateTime()}`);
        myServer.startByPlayerCount(); // check if there are enough players to start the match
    });

    //when a player disconnects from their room
    client.on('room_disconnect', () => {
      if(player.room == undefined){
        return;
      }

      var emitData = {};
      emitData.id = player.id;
      //remove player from their room
      player.room.removePlayer(player);

      //update players in room
      player.room.updateRoomPlayers();

      //destroy current instance of player
      if(player.a == 1){
        //player.room.emit('destroy_player', JSON.stringify(emitData));
        for(let k in player.room.players){
          player.room.players[k].addPlayerToDestroy(player);
        }
      }
      //make player unable to further communicate with room
      player.room = undefined;
    });

    //Broadcast when player defeats boss game
    client.on('boss_defeated', () => {

        //destroy current instance of player
        var emitData = {};
        emitData.id = player.id;
        emitData.username = player.username;
        emitData.pos = player.room.winPosition++;
        client.emit('you_placed',player.room.winPosition); //tell the client their position
        if(player.a == 1){
          //player.room.broadcast(player, 'destroy_player', JSON.stringify(emitData));
          for(let k in player.room.players){
            player.room.players[k].addPlayerToDestroy(player);
          }
          player.a = 0; //player is dead :( we dont want them communicating after the game is won
        }
        player.room.emit('boss_defeated', JSON.stringify(emitData));
    });

    //main update function
    client.on('updateall', (data) => {
      var data = JSON.parse(data);
      //console.log(`datap = ${data.p}`)
      if(data.p != "" && data.p != undefined && player != undefined){ //position

        player.x = data.p.x;
        player.y = data.p.y;
        player.s = data.p.s;
        player.h = data.p.h;
        player.l = data.p.l;
        player.r = data.p.r;
        player.w = data.p.w;
        player.e = data.p.e;
        //console.log(`updated player ${player.username}\'s position! x = ${player.x}`)
      }
      if(data.bc != "" && data.bc != undefined && player != undefined){ //bullet create
      //console.log(`wtf ${JSON.stringify(data.bc)}`);
        for(let b in data.bc){
          //var curBullet = JSON.parse(data.bc[b]);
          //console.log(`bullet x = ${data.bc[b].x}`);
          var time = new Date();

          var bullet = new Bullet();
          bullet.x = data.bc[b].x;
          bullet.y = data.bc[b].y;
          bullet.dir = data.bc[b].dir;
          bullet.f = data.bc[b].f;
          bullet.w = data.bc[b].w;
          bullet.s = data.bc[b].s;
          bullet.id = player.id;

          for(let k in player.bullets){
            if (time.getTime() - player.bullets[k].timestamp > 5000)
              player.bullets.splice(k,1);
          }

            var bulletID = {};
            bulletID.idn = data.bc[b].idn; //how the server identifies the bullet as sent from the client. Its "key". The client knows it.
            bulletID.ids = bullet.ids;//this is the number the server sends to all receiving clients.
            //console.log(`bullet ids = ${bulletID.ids}`);
            bulletID.timestamp = time.getTime();//this is the set time
            player.bullets.push(bulletID); //we save only the key and value pair. maybe turn this into a hashmap later

            if(player.room != undefined){
              for (let k in player.room.players){
                if(player.room.players[k] != player){
                  //console.log(`addbulletstocreate ${bullet.id} to player ${player.room.players[k].username}`);
                  player.room.players[k].addBulletsToCreate(bullet);
                }
              }
            }
          }
        }

        if(data.die != "" && data.die != undefined && player != undefined){ //player die
          for(let b in data.die){
            player.x = data.die[b].x;
            player.y = data.die[b].y;
            player.d = data.die[b].d;
            if(player.room != undefined){
              for (let k in player.room.players){
                if(player.room.players[k] != player){
                  //console.log(`deadplayers + ${player.d}`);
                  player.room.players[k].addDeadPlayers(player);
                }
              }
            }
          }
        }

        if(data.dpo != "" && data.dpo != undefined && player != undefined){ //player destroy other
          for(let b in data.dpo){

            if(player.room != undefined){
              for (let k in player.room.players){
                if(player.room.players[k] != player){
                  //console.log(`deadplayers + ${player.d}`);
                  player.room.players[k].addDeadPlayers(player);
                }
              }
            }
          }
        }

        if(data.dbn != "" && data.dbn != undefined && player != undefined){ //destroy bullet by idN
          for(let b in data.dbn){
            //console.log(`there is a dbn request`);
            for(let p in player.bullets){
              if(player.bullets[p].idn == data.dbn[b].idn){
                //console.log('bullet found to delete');
                var destroyBullet = {};
                destroyBullet.ids = player.bullets[p].ids;

                if(player.room != undefined){ //if the bullet is found, emit to all players to delete
                  for (let k in player.room.players){
                    if(player.room.players[k] != player){
                      //console.log(`destroy bullet + ${player.d}`);
                      player.room.players[k].addBulletsToDestroy(JSON.stringify(destroyBullet));
                    }
                  }
                }
                player.bullets.splice(p,1); //remove bullet
                break;
              }
            }
          }
        }
        if(data.abn != "" && data.abn != undefined && player != undefined){ //actbyidn
          for(let b in data.abn){
            //console.log(`there is a abn request`);
            for(let p in player.bullets){
              if(player.bullets[p].idn == data.abn[b].idn){
                //console.log('bullet found to delete');
                var actBullet = {};
                actBullet.ids = player.bullets[p].ids;
                actBullet.x = data.abn[b].x;
                actBullet.y = data.abn[b].y;
                actBullet.act = data.abn[b].act;
                if(player.room != undefined){ //if the bullet is found, emit to all players to delete
                  for (let k in player.room.players){
                    if(player.room.players[k] != player){
                      //console.log(`destroy bullet + ${player.d}`);
                      player.room.players[k].addBulletsToAct(JSON.stringify(actBullet));
                    }
                  }
                }
                //player.bullets.splice(p,1); //remove bullet
                break;
              }
            }
          }
        }
    });

    //Broadcast when player defeats boss game
    client.on('ready_up', () => {
        player.ready = 1;
        player.room.updateReadyPercent();
    });

    //Broadcast when a player respawns
    client.on('respawn', (data) => {
        data = JSON.parse(data);

        player.x = data.x;
        player.y = data.y;
        player.d = data.d;
        player.room.broadcast(player, 'respawn_other', player.toString());
    });


    // emit total players online
    client.on('get_players_online', () => {
        client.emit('players_online', players.length);
    });

    // emit set spectate on gameover
    client.on('set_spectate', () => {
        if(player.a == 1){
          //player.room.broadcast(player, 'destroy_player', player.toString); //destroy the player for everyone else
          for(let k in player.room.players){
            player.room.players[k].addPlayerToDestroy(player);
          }
          player.a = 0; //set alive state to 0
        }
        player.room.updateRoomPlayers();
    });

    // return remaining players in room after match starts
    client.on('get_room_players', () => {
        var emitData = {};

        var _alivePlayers = 0;
        if(player.room != undefined){
          for(let k in player.room.players){
            //console.log(`k.a = ${player.room.players[k].a}`);
            if(player.room.players[k].a === 1){

              _alivePlayers++;
            }
          }

        //console.log(`aliveplayers = ${_alivePlayers}`);
          emitData.t = player.room.totalPlayers; //total players at room start
          emitData.c = _alivePlayers; // current alive players
          client.emit('room_players', JSON.stringify(emitData));
        }
    });



    // Send some info on the current room
    client.on('get_lobby_online', () => {
        emitData = {};
        emitData.t = myServer.currentRoom.targetPlayers; // target amount of players (max size?)
        emitData.c = myServer.currentRoom.players.length // current amount of players;

        client.emit('lobby_online', JSON.stringify(emitData));
    });

    client.on('dc-pl', function() {
      ///onsole.log(`got discord request`);
      client.emit('pl-on', players.length);
    });

    // When a player closes the game or refresh the page, this event will be triggered
    client.on('disconnect', () => {
      if (typeof player != "undefined") {
          // Tell everyone that we disconnected (ourself NOT included, because we already closed the game and we don't care)

          //if in a room, delet
          if(typeof player.room != "undefined"){


            for(let k in player.room.players){
              player.room.players[k].addPlayerToDestroy(player);
            }


            //player.room.broadcast(player, 'destroy_player', player.toString());
            //remove player from their room
            player.room.removePlayer(player);
            //update players in room
            player.room.updateRoomPlayers();
            player.room.emit('lobby_online', JSON.stringify(emitData));
          }

          //Remove player from list
          players.splice(players.indexOf(player), 1);

          console.log(`Player "${player.username}", with ID: ${player.id} disconnected. ${getDateTime()}`);
        }
    });
});
