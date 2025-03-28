const express = require('express')
const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')
const port = 2025

const app = express()

const session = require('express-session');
app.use(session({
    secret: 'secretKey',
    resave: false,
    saveUninitialized: true
}));

app.use(express.static(__dirname))
app.use(express.urlencoded({ extended: true }))

mongoose.connect('mongodb://127.0.0.1:27017/breathingroom', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
const db = mongoose.connection

db.once('open', () => {
    console.log("MongoDB connected")
})

const userSchema = new mongoose.Schema({
    firstname: String,
    lastname: String,
    email: String,
    password: String
})

const Users = mongoose.model("data", userSchema)

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'classes.html'))
})

app.post('/register', async (req, res) => {
    const { firstname, lastname, email, password } = req.body
    const user = new Users({ firstname, lastname, email, password })
    await user.save()
    console.log(user)
    res.redirect('index.html');
})

function getLoginHtml(emailValue = '', showError = false, callback) {
    const filePath = path.join(__dirname, 'login.html');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return callback(err);

        data = data.replace('id="email"', `id="email" value="${emailValue}"`);

        if (showError) {
            data = data.replace(
                'id="password-error" class="error-bubble" style="display: none;"',
                'id="password-error" class="error-bubble" style="display: block;"'
            );
            data = data.replace(
                '<div id="password-error" class="error-bubble" style="display: block;"></div>',
                '<div id="password-error" class="error-bubble" style="display: block;"> Invalid Password</div>'
            );
            data = data.replace('id="password"', `id="password" style="border: 2px solid red;"`);
        }

        callback(null, data);
    });
}

app.get('/user_profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login.html');
    }

    const filePath = path.join(__dirname, 'user_profile.html');
    fs.readFile(filePath, 'utf8', (err, html) => {
        if (err) return res.status(500).send('Error loading profile');

        const user = req.session.user;

        html = html.replace('Hi, Lexi', `Hi, ${user.firstname}`);
        html = html.replace('MEMBER-DAY PASS', user.membership || 'MEMBER');

        res.send(html);
    });
});

app.get('/check-auth', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await Users.findOne({ email });

    if (!user || user.password !== password) {
        return getLoginHtml(email, true, (err, html) => {
            if (err) return res.status(500).send("Error loading login page");
            res.send(html);
        });
    } else {
        req.session.user = {
            id: user._id,
            email: user.email,
            firstname: user.firstname,
            lastname: user.lastname
        };
        res.redirect('/user_profile');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

app.listen(port, () => {
    console.log("Server Started on port " + port);
})

