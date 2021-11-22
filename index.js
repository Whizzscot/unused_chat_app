const path = require("path");
const http = require("http");
const express = require("express");
const socket = require("socket.io");
const snowflake = require("snowflake-sdk");
const favicon = require("serve-favicon");
const cookieParser = require("cookie-parser");
const nodemailer = require("nodemailer");
const SHA2 = require("sha2");
//const { resolve } = require("path");
const hash = function(string){
    return SHA2["SHA-256"](string).toString("hex");
}

var Hostname = "";
const PORT = process.env.PORT || 3000;

const connection = snowflake.createConnection({
    account:"jf48431.europe-west4.gcp",
    username:"Whizzscot",
    password:"0Homofopozoho",
    warehouse:"COMPUTE_WH",
    database:"HEROKU",
    schema:"CHAT_APP",
});
  
// function snowflake_disconnect(){
//     connection.destroy(function(err, conn) {
//         if (err) {
//             console.error('Unable to disconnect: ' + err.message);
//         } else {
//             console.log('Disconnected connection with id: ' + connection.getId());
//         }
//     });
// }

connection.connect((err,conn)=>{
    if (err) {
        console.error('Unable to connect: ' + err.message);
    } else {
        console.log('Successfully connected to Snowflake.');
    }
});

const Emailer = nodemailer.createTransport({
    service:"gmail",
    auth:{
        user:'elliot.mcleish@gmail.com',
        pass:'rbxbjjvlbqrnpqlj'
    }
});

var CACHE = {
    unconfirmed_emails:{},
    password_reset_tokens:{}
};

function generateId(use){
    return new Promise((resolve, reject)=>{
        if(!use) return resolve(Math.random().toString(36).slice(2));
        let id = '';
        while(id.length < 11) id += Math.random().toString(36).slice(2);
        id = id.slice(0, 11);
        //id = 'aaaaaaaaaaa';
        connection.execute({
            'sqlText':"select * from users where id = ?",
            'binds':[id],
            'complete':function(err,stmt,rows){
                if(err) return reject(err);
                if(rows.length) return resolve(generateId(true));
                resolve(id);
            }
        })
    });
};

function generateToken(id, password, user){
    return new Promise((resolve, reject)=>{
        if(password) return resolve([id+'.'+hash(id+password), user]);
        connection.execute({
            'sqlText':"select * from users where id=?",
            'binds':[id],
            'complete':function(err,stmt,rows){
                if(err)return reject(err);
                if(!rows[0])return reject(new Error("Invalid Token"));
                resolve([rows[0].ID+"."+hash(rows[0].ID+rows[0].PASSWORD),rows[0]]);
            }
        })
    });
};

function createUser(email, name, rawPassword){
    return new Promise((resolve, reject)=>{
        connection.execute({
            'sqlText':"select * from users where email=?",
            'binds':[email],
            'complete':function(err,stmt,rows){
                if(rows.length)return reject(new Error("There is already an account connected to that e-mail"));
                generateId(true).then(id=>{
                    let password = hash(rawPassword+id);
                    connection.execute({
                        'sqlText':"insert into users(id, name, email, password, created) values(?, ?, ?, ?, current_timestamp::timestamp_ntz)",
                        'binds':[id,name,email,password],
                        'complete':function(err,stmt,rows){
                            if(err)return reject(err, stmt.getSqlText());
                            resolve();
                        }
                    })
                }).catch(err=>reject(err));
            }
        });
    });
};

function authUser(token, callback){
    if(!token) return callback(new Error("Invalid Token"));
    let split = token.split(".");
    let id = split[0];
    generateToken(id).then(data=>{
        let realToken = data[0];
        let user = data[1];
        (realToken === token) ? callback(null, user) : callback(new Error("Invalid Token"));
    }).catch(err=>callback(err))
};

function loginUser(email, password){
    return new Promise((resolve, reject)=>{
        connection.execute({
            'sqlText':"select id, password from users where email=?",
            'binds':[email],
            'complete':function(err,stmt,rows){
                if(err){
                    console.log("Login Error:"+err.message);
                    return reject(err);
                }
                if(!rows[0] || (hash(password+rows[0].ID) !== rows[0].PASSWORD))return reject(new Error("Email or Password is Incorrect"));
                generateToken(rows[0].ID, rows[0].PASSWORD).then(resolve);
            }
        })
    });
};

function generatePasswordReset(email){
    return new Promise((resolve, reject)=>{
        connection.execute({
            'sqlText':'select id from users where email=?',
            'binds':[email],
            'complete':function(err,stmt,rows){
                if(err) return reject(err);
                if(!rows[0]) return reject(new Error("That Account does not exist"))
                let token = "";
                while(token.length < 100){
                    token += Math.random().toString(36).slice(2);
                }
                let expiryTimestamp = Date.now()+1000*60*30;
                CACHE.password_reset_tokens[email] = {
                    token,
                    validUntil:expiryTimestamp
                }
                Emailer.sendMail({
                    to:email,
                    subject:"Password reset",
                    html:`You recently requested a password Reset for your account. Please follow the link below to change it.<br>Do so quickly, as your token will expire at ${new Date(expiryTimestamp)}, and you will need to request a new one.<br><a href='http://${Hostname}:3000/passwordreset?token=${token}&&id=${rows[0].ID}&&email=${email}'>Reset Password</a>`
                },(err,info)=>{
                    if(err)return reject(err);
                    resolve();
                });
            }
        })
    });
};

const app = express()
    .use((req,res,next)=>{Hostname=req.hostname;console.log(Hostname);next();})
    .use(express.json())
    .use(cookieParser())
    .use((req,res,next)=>{
        authUser(req.cookies.token, (err, user)=>{
            // console.log("Checking User Authentication...");
            if(err){
                // console.log("Authentication Error: "+err.message);
                if(err.message === "Invalid Token"){
                    // console.log("User in not Valid");
                    req.validLogin = false;
                    return next();
                }
                return res.send(err.message);
            }
            // console.log("User is Valid");
            req.validLogin = true;
            req.userData = user;
            next();
        });
    })
    .use(favicon(path.join(__dirname, "favicon.ico")))
    .use('/images',express.static(path.join(__dirname,"images")))
    .get('/favicon.ico',(req,res)=>res.sendFile(path.join(__dirname, "favicon.ico")))
    .get('/form.css',(req,res)=>res.sendFile(path.join(__dirname,"form.css")))
    .get('/',(req,res)=>{
        // console.log("Valid Login to main: "+req.validLogin);
        if(req.validLogin) return res.sendFile(path.join(__dirname, "index.html"));
        if(req.cookies.token) return res.redirect("/login");
        res.redirect("/signup");
    })
    .get('/login',(req,res)=>{
        // console.log("Valid Login at login page: "+req.validLogin);
        if(req.validLogin) return res.redirect("/");
        res.sendFile(path.join(__dirname, "login.html"));
    })
    .post('/login',(req,res)=>{
        let body = '';
        req.on('data',data=>{
            body += data;
            if (body.length > 1e6)
                request.connection.destroy();
        });
        req.on('end',()=>{
            let form = new URLSearchParams(body);
            let email = form.get('email');
            let password = form.get('password');
            loginUser(email, password).then(data=>{
                let token = data[0];
                res.cookie('token', token, {"maxAge":1000*60*60*24*365*10});
                res.redirect("/");
            }).catch(err=>{
                console.error("Login Error: "+err);
                res.redirect('/login?errmsg='+encodeURIComponent(err.message));
            });
        })
    })
    .post('/logout',(req,res)=>{
        res.clearCookie('token');
        res.send("You have Successfully Logged Out.")
    })
    .get('/forgotpassword',(req,res)=>{
        if(req.query.email){
            return generatePasswordReset(req.query.email).then(()=>{
                res.send("You have been sent an e-mail to reset your password. It may take a few minutes to arrive.")
            }).catch(err=>res.redirect('/forgotpassword?errmsg='+err.message));
        }
        res.sendFile(path.join(__dirname,"get_email.html"));
    })
    .post('/forgotpassword',(req,res)=>{
        let body = '';
        req.on('data',data=>{
            body += data;
            if (body.length > 1e6)
                request.connection.destroy();
        });
        req.on('end',()=>{
            let email = new URLSearchParams(body).get('email');
            res.redirect('/forgotpassword?email='+email);
        })
    })
    .get('/passwordreset',(req,res)=>res.sendFile(path.join(__dirname,"passwordreset.html")))
    .post('/resetpassword',(req,res)=>{
        let body = '';
        req.on('data',data=>{
            body += data;
            if (body.length > 1e6)
                request.connection.destroy();
        });
        req.on('end',()=>{
            let token = req.query.token;
            let email = req.query.email;
            let id = req.query.id;
            let params = new URLSearchParams(body);
            let password = params.get('password');
            let password_confirm = params.get('passwordconfirm');
            let tokenData = CACHE.password_reset_tokens[email];
            if(!tokenData)
                return res.send(`Sorry! Your token is invalid. Please <a href='/forgotpassword?email=${email}'>send a new request.</a>`);
            if(tokenData.token !== token || CACHE.password_reset_tokens[email].validUntil < Date.now()){
                delete CACHE.password_reset_tokens[email];
                return res.send(`Sorry! Your token has expired. Please <a href='/forgotpassword?email=${email}'>send a new request.</a>`);
            } 
            if(password!==password_confirm)
                return res.redirect('/passwordreset?errmsg=Passwords do not Match');
            connection.execute({
                'sqlText':'update users set password=? where email=?',
                'binds':[hash(password+id),email],
                'complete':function(err,stmt){
                    if(err){
                        //console.error("Error Resetting Password: "+err.message);
                        return res.redirect("/passwordreset?errmsg="+err.message);
                    }
                    delete CACHE.password_reset_tokens[email];
                    res.send("Your Password has been Reset.<br><a href='/login'>Log In</a>");
                }
            });
        });
    })
    .get('/signup',(req,res)=>{
        res.sendFile(path.join(__dirname, "signup.html"));
    })
    .post('/signup',(req,res)=>{
        let body = '';
        req.on('data',data=>{
            body += data;
            if (body.length > 1e6)
                request.connection.destroy();
        });
        req.on('end',()=>{
            let form = new URLSearchParams(body);
            let email = form.get('email');
            let name = form.get('username');
            let password = form.get('password');
            let password_confirm = form.get('passwordconfirm');
            if(password !== password_confirm) return res.redirect('/signup?errmsg='+encodeURIComponent("Passwords Do not Match"));
            createUser(email, name, password).then(()=>{
                res.redirect('/signupsuccess?email='+email);
            }).catch(err=>{
                //console.log("Signup Error:\n"+err.message);
                res.redirect('/signup?errmsg='+encodeURIComponent(err.message));
            });
        })
    })
    .get('/signupsuccess',(req,res)=>{
        let email = req.query.email;
        generateId().then(token=>{
            CACHE.unconfirmed_emails[email] = token;
            Emailer.sendMail({
                from:"Can anything be Here?",
                to:email,
                subject:"Confirm Email",
                html:`<br><a href='http://${Hostname}:3000/emailconfirm?token=${token}&&email=${email}'>Click to Confirm Email</a>`,
            },(err,info)=>{
                if(err)return res.send(err.message);
                // console.log(`Email sent!\n${info.response}`);
                res.sendFile(path.join(__dirname,"signupsuccess.html"));
            });
        });
    })
    .get('/emailconfirm',(req,res)=>{
        let email = req.query.email;
        let token = req.query.token;
        if(CACHE.unconfirmed_emails[email] === token){
            connection.execute({
                'sqlText':"update users set confirmed=true where email=?",
                'binds':[email],
                'complete':function(err,stmt){
                    if(err){
                        console.error("Error Confirming Email\n",err.message);
                        return res.send(err.message);
                    }
                    delete CACHE.unconfirmed_emails[email];
                    res.send('Email Confirmed<br><a href="/">Home</a>');
                }
            });
        }else{
            res.send(`Sorry! Your token expired.<a href='/signupsuccess?email=${email}'>Re-Confirm Email</a>`);
        }
    })
    .all("*",(req,res)=>res.sendFile(path.join(__dirname, "404.html")))
;

const server = app.listen(PORT,()=>console.log(`Server listening on port ${PORT}...`));
const io = socket(server)
    .use((socket, next)=>{
        authUser(socket.handshake.auth.token, (err, user)=>{
            if(err){
                // console.error(err);
                next(err);
            }
            socket.userData = user;
            next();
        });
    })
;

io.on('connection',socket=>{
    socket.on("message", message=>{
        message.sent = message.sent || Date.now();
        console.log(`Message Sent by ${socket.userData.NAME} at ${message.sent}.\nContent: "${message.content}"`);
    });
    socket.emit("userdata",socket.userData);
})