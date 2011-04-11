node-ottdadmin
==============
this is an (ugly) library for communicating with the [openttd](http://openttd.org/) [admin interface](http://svn.openttd.org/trunk/docs/admin_network.txt) using node.js

Basic Example
=============
    var AdminConnection = require('node-ottdadmin/adminconnection');
    var tcp_enum        = require('node-ottdadmin/tcp_enum');
    var net             = require('net');
    
    var connection = AdminConnection(net.createConnection(3977), "password");
    connection.on('welcome', function() {
        console.log("connected");
        connection.send_chat(tcp_enum.Actions.SERVER_MESSAGE, tcp_enum.DestTypes.BROADCAST, 0, "hello, world!");
        connection.send_quit();
        console.log("disconnected");
    });

