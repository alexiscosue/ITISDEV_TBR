const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const port = 2025;
const app = express();

app.use(session({
  secret: 'secretKey',
  resave: false,
  saveUninitialized: true
}));

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));

mongoose.connect('mongodb://127.0.0.1:27017/breathingroom', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.once('open', () => {
  console.log("MongoDB connected");
});

// SCHEMAS
const membershipSchema = new mongoose.Schema({
  name: String,
  category: String,
  description: String,
  price: Number,
  duration: String
});
const Membership = mongoose.model("Membership", membershipSchema);

const classSchema = new mongoose.Schema({
  title: String,
  instructor: String,
  date: Date,
  time: String,
  venue: String,
  price: Number
});
const Class = mongoose.model("Class", classSchema);

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },
  status: String,
  bookingDate: {
    type: Date,
    default: Date.now
  }
});
const Booking = mongoose.model("Booking", bookingSchema);

const userSchema = new mongoose.Schema({
  firstname: String,
  lastname: String,
  email: String,
  password: String,
  membershipPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Membership'
  },
  bookings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  }]
});
const User = mongoose.model("User", userSchema);

// ROUTES
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'classes.html'));
});

app.post('/register', async (req, res) => {
  const { firstname, lastname, email, password } = req.body;
  const user = new User({ firstname, lastname, email, password });
  await user.save();

  // Set session
  req.session.user = {
    id: user._id,
    email: user.email,
    firstname: user.firstname,
    lastname: user.lastname,
    membership: user.membershipPlan
  };

  res.redirect('/user_profile');
});


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
  const user = await User.findOne({ email });

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
      lastname: user.lastname,
      membership: user.membershipPlan // may be populated later
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
});

app.get('/api/memberships', async (req, res) => {
  try {
    const memberships = await Membership.find({}).lean();
    
    // Group memberships by category
    const grouped = memberships.reduce((acc, membership) => {
      const cat = membership.category || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(membership);
      return acc;
    }, {});

    res.json(grouped);
  } catch (err) {
    res.status(500).send('Error fetching memberships');
  }
});
