
function twitch_ws(client_id) {
    var Channels=[], ClientID;
    var _ws;
    var handlers = {
        onMessage: true,
        onPrivmsg: true,
        onRoomstate:true,
        onJoin: true,
        onPart: true
    };

    var debug = true;

    var refObj = this;

    var channelsLoading = 0;

    if (!client_id) {
        console.log('ClientID undefined, will not be able to generate follower events.');
    }
    else {
        ClientID = client_id;
    }

    this.Debug = function () {
        console.log(Channels);
    }

    this.Join = function (channelArray) {
        if (!Array.isArray(channelArray)) {
            console.log('Channel list not an array!');
            return;
        }

        if (channelArray.length == 0) {
            console.log('No channels specified!');
            return;
        }

        if (channelArray) {
            channelArray.forEach((chan) => {
                Channels[chan.toLowerCase().trim()] = {};
            });
        }


        if (_ws != undefined && _ws.readyState != 3) {
            _ws.close();
            return;
        }

        channelsLoading = channelArray.length;

        _ws = new WebSocket('wss://irc-ws.chat.twitch.tv');


        _ws.onopen = function () {
            this.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
            this.send('NICK justinfan' + Math.floor(Math.random() * 999999));

            //this.send('JOIN #199.9.253.119');
            for (var chan in Channels) {
                this.send('JOIN #' + chan);
            }

        }

        _ws.onmessage = function (msgEvent) {
            var data = msgEvent.data;
            if (debug) {
                console.log('>' + data);
            }

            if (refObj.onMessage) {
                refObj.onMessage(data);
            }
            else {
                if (handlers.onMessage) {
                    console.log('No onMessage handler defined!');
                    handlers.onMessage = false;
                }
            }


            var parts = data.split(' ');
            var userdata = parts[0].split(';');

            if (parts[0] == 'PING') {
                send('PONG ' + parts[1].substring(1));
            }
            else if (parts[2] == 'ROOMSTATE') {
                //TODO: add event handler for ROOMSTATE
                var channel = data.split(' ')[3].substring(1).trim();


                //channel record has already been created, bail
                if (Channels[channel].RoomID != undefined) {
                    return;
                }

                var roomId;
                for (var i = 0; i < userdata.length; i++) {
                    if (userdata[i].indexOf('room-id') == 0) {
                        var roomId = userdata[i].split('=')[1];
                        break;
                    }
                }

                //this should never be hit, it means the chat API did something very bad, but if it did, bail
                if (roomId == null) {
                    return;
                }


                //cool, we're supposed to be here, initialize channel data
                Channels[channel].RoomID = roomId;
                Channels[channel].Followers = [];
                Channels[channel].FollowerCount = -1;
                Channels[channel].LastCursor = '';
                Channels[channel].LatestFollowerID = -1;
                Channels[channel].LatestFollowerName = '';
                Channels[channel].InitialLoadComplete = false;


                //client id was provided, so kick off follower load routine
                if (ClientID != null) {
                    GetFollowers(channel, roomId);
                }

                Channels[channel].InitialLoadComplete = true;

                if (refObj.onRoomstate) {
                    refObj.onRoomstate(data);
                }
                else {
                    if (handlers.onRoomstate) {
                        console.log('No onRoomstate handler defined!');
                        handlers.onRoomstate = false;
                    }
                }


            }
            else if (parts[1] == 'PRIVMSG') {
                if (refObj.onPrivmsg) {
                    refObj.onPrivmsg(data);
                }
                else {
                    if (handlers.onPrivmsg) {
                        console.log('No onPrivmsg handler defined!');
                        handlers.onPrivmsg = false;
                    }
                }
            }

        }


        //whoops
        _ws.onerror = function (e) {
            console.log('Websocket error: ', e);
        }


        //auto reconnect 
        _ws.onclose = function (e) {
            setTimeout(function () {
                refObj.Join();
            }, 1000);
        }
    }


    function GetFollowers(channel, roomId) {

        Channels[channel].httpRequest = new XMLHttpRequest();

        Channels[channel].httpRequest.onreadystatechange = function () {

            if (this.readyState == 4 && this.status === 200) {

                var chanId = this.responseURL.split('?')[1].split('&')[0].split('=')[1];
                var chanName = '', chanIdx = 0;

                for (var chan in Channels) {
                    if (Channels[chan].RoomID == chanId) {
                        chanName = chan;
                        break;
                    }
                    chanIdx++;
                }

                var json = JSON.parse(this.responseText);

                Channels[chanName].FollowerCount = json.total;

                for (var j = 0; j < json.data.length; j++) {
                    //if first record of first page, save as latest follower id
                    if (j == 0 && Channels[chanName].LatestFollowerID == -1) {
                        Channels[chanName].LatestFollowerID = json.data[j].from_id;
                    }

                    //don't add duplicates
                    if (Channels[chanName].Followers.indexOf(json.data[j].from_id) == -1) {
                        Channels[chanName].Followers.push(json.data[j].from_id);
                    }
                }

                if (json.data.length == 100) {
                    //full page of data, grab pagination cursor and set delayed request to avoid being rate limited
                    Channels[chanName].httpRequest.open('GET', 'https://api.twitch.tv/helix/users/follows?to_id=' + roomId + '&first=100&after=' + json.pagination.cursor);
                    Channels[chanName].httpRequest.setRequestHeader('Client-ID', ClientID);
                    setTimeout(function () {
                        Channels[chanName].httpRequest.send();
                    }, 2000 * channelsLoading);
                }
                else {
                    //last page of data
                    Channels[chanName].InitialLoadComplete = true;
                    Channels[chanName].httpRequest.onreadystatechange = null;
                    console.log('Channel ' + chanName + ' follower load complete');
                    channelsLoading--;
                }
            }
        };

        //create and send initial followers api request
        Channels[channel].httpRequest.open('GET', 'https://api.twitch.tv/helix/users/follows?to_id=' + roomId + '&first=100');
        Channels[channel].httpRequest.setRequestHeader('Client-ID', ClientID);
        Channels[channel].httpRequest.send();

    }


    function send(msg) {
        _ws.send(msg);
        if (debug) {
            console.log('<' + msg);
        }
    }

}



