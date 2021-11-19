const path = require("path");
const express = require("express");
const socket = require("socket.io");
const snowflake = require("snowflake-sdk");
const favicon = require("serve-favicon");
const cookieParser = require("cookie-parser");
const socketCookieParser = require("socket.io-cookie-parser");
const nodemailer = require("nodemailer");

const PORT = process.env.PORT || 3000;

const connection = snowflake.createConnection({
    account:"jf48431.europe-west4.gcp",
    username:"Whizzscot",
    password:"0Homofopozoho",
    warehouse:"COMPUTE_WH",
    database:"HEROKU",
    schema:"CHAT_APP",
});
  
function snowflake_disconnect(){
    connection.destroy(function(err, conn) {
        if (err) {
            console.error('Unable to disconnect: ' + err.message);
        } else {
            console.log('Disconnected connection with id: ' + connection.getId());
        }
    });
}

connection.connect((err,conn)=>{
    if (err) {
        console.error('Unable to connect: ' + err.message);
    } else {
        console.log('Successfully connected to Snowflake.');
    }
});

/*connection.execute({
    sqlText:'select * from test',
    complete:function(err,stmt,rows){
        if(err)return console.error('Failed to execute statement due to the following error: ' + err.message);
        socket.emit("data",rows);
    }
});*/

const Emailer = nodemailer.createTransport({
    service:"gmail",
    auth:{
        user:'elliot.mcleish@gmail.com',
        pass:'rbxbjjvlbqrnpqlj'
    }
});

// Emailer.sendMail({
//     from:"elliot.mcleish@gmail.com",
//     to:"elliot.mcleish@gmail.com",
//     subject:"Hey You",
//     text:"This was sent using my Node.js application, hosted by the laptop. :)",
// },(err,info)=>{
//     if(err)return console.error(err.message);
//     console.log(`Email sent!\n${info.response}`);
// })

const app = express()
    .use(express.json())
    .use(cookieParser())
    .use(favicon(path.join(__dirname,"favicon.png")))
    .get('/',(req,res)=>{res.redirect("/main")})
    .get('/main',(req,res)=>{res.sendFile(path.join(__dirname,"index.html"))})
    .all("*",(req,res)=>res.sendFile(path.join(__dirname,"404.html")))
;

const server = app.listen(PORT,()=>console.log(`Server listening on port ${PORT}...`));
const io = socket(server)
    .use(socketCookieParser())
    .use((socket,next)=>{
        //socket.handshake.auth
        next();
    })
;

io.on('connection',socket=>{

})