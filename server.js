const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { check, validationResult } = require('express-validator');

const port = 2025;
const app = express();

app.use(session({
  secret: 'secretKey',
  resave: false,
  saveUninitialized: true
}));

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // To handle JSON payloads

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
  birthday: Date, 
  contactNumber: String, 
  preferences: [String],
  membershipPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Membership'
  },
  classes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class' 
  }]
});
const User = mongoose.model("User", userSchema);

// PAYMENT SCHEMA
const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  membershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  amount: Number,
  paymentDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['completed', 'pending'], default: 'pending' }
});
const Payment = mongoose.model('Payment', paymentSchema);

// ROUTES
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'classes.html'));
});

// Register user
app.post('/register', [
  check('firstname', 'First Name is required').not().isEmpty(),
  check('lastname', 'Last Name is required').not().isEmpty(),
  check('email', 'Email is required').isEmail(),
  check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
  check('birthday', 'Birthday is required').not().isEmpty(),
  check('contact', 'Contact number is required').not().isEmpty()
], async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { firstname, lastname, email, password, birthday, contact, preferences, classIds } = req.body;

  try {
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const birthdayDate = new Date(birthday);

    // Create new user
    const newUser = new User({
      firstname,
      lastname,
      email,
      password: hashedPassword,
      birthday: birthdayDate,
      contactNumber: contact,
      preferences: preferences ? preferences.split(',') : [], // Split preferences if provided
      classes: classIds || [] // Add the class IDs the user is enrolled in
    });

    // Save the new user to the database
    await newUser.save();

    req.session.user = {
      id: newUser._id,
      email: newUser.email,
      firstname: newUser.firstname,
      lastname: newUser.lastname,
      membership: newUser.membershipPlan
    };

    res.redirect('/index.html');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.post('/update-profile', async (req, res) => {
  const { firstName, lastName, birthday, email, password, contact } = req.body;
  const userId = req.session.user.id;

  try {
    // Find the user by their ID
    const user = await User.findById(userId);

    // Update the user's information
    user.firstname = firstName;
    user.lastname = lastName;
    user.birthday = birthday;  // Update birthday
    user.email = email;
    if (password) {
      const salt = await bcrypt.genSalt(10); // Generate salt
      user.password = await bcrypt.hash(password, salt); // Update password
    }
    user.contactNumber = contact;  // Update contact number

    // Save updated user
    await user.save();

    // Update the session with the new data
    req.session.user.firstname = firstName;
    req.session.user.lastname = lastName;
    req.session.user.birthday = birthday;
    req.session.user.email = email;
    req.session.user.contactNumber = contact;

    // Send a response back indicating success
    res.redirect('/user_profile');
  } catch (error) {
    console.error("Error updating profile:", error);
    res.json({ success: false, message: "Something went wrong while updating your profile." });
  }
});




// Class Enrollment (Add a class to the user)
app.post('/enroll-in-class', async (req, res) => {
  const { classId } = req.body;
  const userId = req.session.user.id;

  try {
    const user = await User.findById(userId);
    const classToEnroll = await Class.findById(classId);

    user.classes.push(classToEnroll._id);
    await user.save();

    res.json({ message: 'User enrolled in class successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// User Profile
app.get('/user_profile', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login.html');
  }

  try {
    // Get user data, including their enrolled classes
    const user = await User.findById(req.session.user.id).populate('classes'); // Populate the classes array

    const filePath = path.join(__dirname, 'user_profile.html');
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) return res.status(500).send('Error loading profile');
      
      // Replace placeholders with user data
      html = html.replace('Hi, Lexi', `Hi, ${user.firstname}`);
      html = html.replace('MEMBER-DAY PASS', user.membership || 'MEMBER');
      
      // Example: Display user's enrolled classes
      let classesHtml = '';
      user.classes.forEach(classItem => {
        classesHtml += `<li>${classItem.title} - ${classItem.date}</li>`;
      });
      html = html.replace('<ul id="user-classes"></ul>', `<ul id="user-classes">${classesHtml}</ul>`);
      
      res.send(html);
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error retrieving profile data');
  }
});

// Check if the user is logged in
app.get('/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// Login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.redirect('/login.html?error=User does not exist'); // Pass error message in URL
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.redirect('/login.html?error=Invalid credentials'); // Pass error if credentials are invalid
  }

  // Store user in session
  req.session.user = {
    id: user._id,
    email: user.email,
    firstname: user.firstname,
    lastname: user.lastname,
    membership: user.membershipPlan,
    birthday: user.birthday,
    contactNumber: user.contactNumber,
    preferences: user.preferences
  };

  // Redirect to user profile page after successful login
  res.redirect('/');
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

app.listen(port, () => {
  console.log("Server Started on port " + port);
});

// Route to serve membership data
app.get('/memberships', async (req, res) => {
  try {
    const memberships = await Membership.find(); // Fetch all memberships from the database
    res.json(memberships); // Send memberships as JSON response
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});
