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
app.use(express.json()); 

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

// Updated class schema to handle date arrays
const classSchema = new mongoose.Schema({
  title: String,
  instructor: String,
  date: [Date], // Now an array of dates
  time: String,
  venue: String,
  description: String,
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
  classDate: Date, // Specific date from the class's date array
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

const paymentSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  membershipId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Membership' 
  },
  classId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Class' 
  },
  amount: {
    type: Number,
    required: true
  },
  paymentDate: { 
    type: Date, 
    default: Date.now,
    required: true
  },
  status: { 
    type: String, 
    enum: ['completed', 'pending', 'cancelled'], 
    default: 'pending',
    required: true
  }
}, { timestamps: true });
const Payment = mongoose.model("Payment", paymentSchema);

// ROUTES
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'classes.html'));
});

// Add this initialization code (run once to populate the database)
async function initializeDatabase() {
  try {
    // Initialize Classes
    const classCount = await Class.countDocuments();
    if (classCount === 0) {
      const classData = require('./classes.json');
      await Class.insertMany(classData);
      console.log('Classes database initialized');
    }

    // Initialize Memberships
    const membershipCount = await Membership.countDocuments();
    if (membershipCount === 0) {
      const membershipData = require('./memberships.json');
      await Membership.insertMany(membershipData);
      console.log('Memberships database initialized');
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// Call this function when your server starts
initializeDatabase();

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
    const errorMessages = errors.array().map(err => err.msg);
    return res.redirect('/register.html?error=' + encodeURIComponent(errorMessages.join(', ')));
  }

  const { firstname, lastname, email, password, birthday, contact } = req.body;

  try {
    // Check if email already exists first
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.redirect('/register.html?error=Email is already registered');
    }

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
      classes: []
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


app.post('/check-email', async (req, res) => {
  const { email } = req.body;

  try {
    // Check if email already exists in the database
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ errors: ['Email is already registered.'] });
    }
    res.json({ success: true });
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
    user.birthday = birthday;  
    user.email = email;
    if (password) {
      const salt = await bcrypt.genSalt(10); 
      user.password = await bcrypt.hash(password, salt); 
    }
    user.contactNumber = contact;  

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

// Modified to handle class enrollment with specific date
app.post('/enroll-in-class', async (req, res) => {
  const { classId, classDate } = req.body;
  const userId = req.session.user.id;

  try {
    const user = await User.findById(userId);
    const classToEnroll = await Class.findById(classId);

    if (!user || !classToEnroll) {
      return res.status(404).json({ message: 'User or class not found' });
    }

    // Create booking with the specific date
    const booking = new Booking({
      user: userId,
      class: classId,
      classDate: new Date(classDate),
      status: 'confirmed'
    });
    await booking.save();

    // Add class to user's classes
    user.classes.push(classToEnroll._id);
    await user.save();

    res.json({ message: 'User enrolled in class successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Add this route to process class bookings with membership discount
app.post('/book-class', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const { classId, classDate, price } = req.body;
  const userId = req.session.user.id;

  try {
    const user = await User.findById(userId).populate('membershipPlan');
    const classToBook = await Class.findById(classId);

    if (!classToBook) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    // Determine price - use the price from request which should be 0 if user has membership
    const finalPrice = user.membershipPlan ? 0 : classToBook.price;

    // Create booking with the specific date
    const booking = new Booking({
      user: userId,
      class: classId,
      classDate: new Date(classDate),
      status: 'confirmed'
    });
    await booking.save();

    // Record payment
    const newPayment = new Payment({
      userId: user._id,
      classId: classToBook._id,
      amount: finalPrice,
      status: 'completed',
    });
    await newPayment.save();

    // Add class to user's classes if not already there
    if (!user.classes.includes(classToBook._id)) {
      user.classes.push(classToBook._id);
      await user.save();
    }

    res.json({ 
      success: true, 
      paymentId: newPayment._id 
    });
  } catch (error) {
    console.error('Error booking class:', error);
    res.status(500).json({ success: false, message: 'Error processing booking' });
  }
});

// Updated to handle classes with multiple dates
app.get('/api/classes', async (req, res) => {
  try {
    const classes = await Class.find();
    
    // Transform classes data to handle date arrays
    const transformedClasses = [];
    
    classes.forEach(cls => {
      // For each date in the class's date array, create a separate class instance
      cls.date.forEach(date => {
        transformedClasses.push({
          _id: cls._id,
          title: cls.title,
          instructor: cls.instructor,
          date: date,
          time: cls.time,
          venue: cls.venue,
          description: cls.description,
          price: cls.price
        });
      });
    });
    
    // Sort by date
    transformedClasses.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    res.json(transformedClasses);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// Add this route to your server.js
app.get('/api/class-descriptions', async (req, res) => {
  try {
    const classes = await Class.find({}, 'title description').sort({ title: 1 });
    const uniqueClasses = [];
    const titleSet = new Set();
    
    // Filter to only include unique class titles
    classes.forEach(cls => {
      if (!titleSet.has(cls.title)) {
        titleSet.add(cls.title);
        uniqueClasses.push(cls);
      }
    });
    
    res.json(uniqueClasses);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// User Profile Route - Updated to properly populate membership and show class dates
app.get('/user_profile', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login.html');
  }

  try {
    // Populate both membershipPlan and classes
    const user = await User.findById(req.session.user.id)
      .populate('membershipPlan')
      .populate('classes');

    // Get bookings to show specific dates
    const bookings = await Booking.find({ user: req.session.user.id })
      .populate('class')
      .sort({ classDate: 1 });

    if (!user) {
      return res.status(404).send('User not found');
    }

    const filePath = path.join(__dirname, 'user_profile.html');
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) return res.status(500).send('Error loading profile');

      // Replace placeholders with user data
      html = html.replace('Hi, Lexi', `Hi, ${user.firstname}`);
      
      // Properly check for membership and display its name
      const membershipTitle = user.membershipPlan ? user.membershipPlan.name : 'No membership selected';
      html = html.replace('No membership selected', membershipTitle);

      // Display user's enrolled classes with specific dates from bookings
      let classesHtml = '';
      if (bookings && bookings.length > 0) {
        bookings.forEach(booking => {
          if (booking.class) {
            const classDate = new Date(booking.classDate).toLocaleDateString();
            classesHtml += `<li>${booking.class.title} - ${classDate} (${booking.class.time})</li>`;
          }
        });
      } else {
        classesHtml = '<li>No classes booked yet</li>';
      }
      html = html.replace('<ul id="user-classes"></ul>', `<ul id="user-classes">${classesHtml}</ul>`);
      
      res.send(html);
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error retrieving profile data');
  }
});


// Add this route to get user bookings with class details
app.get('/api/user-bookings', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json([]);
  }

  try {
    const bookings = await Booking.find({ user: req.session.user.id, status: 'confirmed' })
      .populate({
        path: 'class',
        select: 'title instructor time venue'
      })
      .sort({ classDate: 1 });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json([]);
  }
});

// Update the /cancel-class-booking route to properly populate class data
app.post('/cancel-class-booking', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const { bookingId } = req.body;

  try {
    const booking = await Booking.findById(bookingId)
      .populate('class');
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.user.toString() !== req.session.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Change booking status to cancelled
    booking.status = 'cancelled';
    await booking.save();

    // Record cancellation in payments with full class details
    const newPayment = new Payment({
      userId: req.session.user.id,
      classId: booking.class._id,
      amount: 0,
      status: 'cancelled',
      class: { // Store class details directly in payment
        title: booking.class.title,
        instructor: booking.class.instructor,
        date: booking.classDate,
        time: booking.class.time,
        venue: booking.class.venue,
        price: booking.class.price
      }
    });
    await newPayment.save();

    // Remove class from user's classes array if no other active bookings exist
    const activeBookings = await Booking.countDocuments({
      user: req.session.user.id,
      class: booking.class._id,
      status: 'confirmed'
    });

    if (activeBookings === 0) {
      await User.updateOne(
        { _id: req.session.user.id },
        { $pull: { classes: booking.class._id } }
      );
    }

    res.json({ 
      success: true,
      paymentId: newPayment._id,
      className: booking.class.title,
      classDate: booking.classDate,
      classTime: booking.class.time,
      instructor: booking.class.instructor
    });
  } catch (error) {
    console.error('Error cancelling class booking:', error);
    res.status(500).json({ success: false, message: 'Error processing request' });
  }
});

// Also update the other cancellation route to ensure consistency
app.post('/cancel-booking/:id', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  try {
    const booking = await Booking.findById(req.params.id)
      .populate('class')
      .populate('user');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.user._id.toString() !== req.session.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Update booking status
    booking.status = 'cancelled';
    await booking.save();

    // Remove class from user's classes array if no other bookings exist
    const activeBookings = await Booking.countDocuments({
      user: req.session.user.id,
      class: booking.class._id,
      status: 'confirmed'
    });

    if (activeBookings === 0) {
      await User.updateOne(
        { _id: req.session.user.id },
        { $pull: { classes: booking.class._id } }
      );
    }

    // Record cancellation payment - Make sure class ID is properly set
    const newPayment = new Payment({
      userId: booking.user._id,
      classId: booking.class._id, // Ensure this is properly set
      amount: 0,
      status: 'cancelled'
    });
    await newPayment.save();

    res.json({ 
      success: true,
      paymentId: newPayment._id
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ success: false, message: 'Error processing request' });
  }
});

// Update the check-auth route
app.get('/check-auth', async (req, res) => {
  if (req.session.user) {
    try {
      // Always fetch fresh user data from database
      const updatedUser = await User.findById(req.session.user.id)
        .populate('membershipPlan')
        .populate('classes');
      
      if (updatedUser) {
        // Update session with complete fresh data
        req.session.user = {
          id: updatedUser._id,
          email: updatedUser.email,
          firstname: updatedUser.firstname,
          lastname: updatedUser.lastname,
          birthday: updatedUser.birthday,
          contactNumber: updatedUser.contactNumber,
          membership: updatedUser.membershipPlan,
          classes: updatedUser.classes
        };
        
        res.json({ 
          loggedIn: true, 
          user: req.session.user
        });
      } else {
        req.session.destroy();
        res.json({ loggedIn: false });
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      res.json({ loggedIn: true, user: req.session.user });
    }
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

// Update the /cancel-membership route
app.post('/cancel-membership', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const userId = req.session.user.id;

  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.membershipPlan) {
      return res.status(400).json({ success: false, message: 'No active membership' });
    }

    const membership = await Membership.findById(user.membershipPlan);

    // Record cancellation
    const newPayment = new Payment({
      userId: user._id,
      membershipId: user.membershipPlan,
      amount: 0,
      paymentDate: new Date(),
      status: 'cancelled'
    });
    await newPayment.save();

    // Update user
    user.membershipPlan = null;
    await user.save();

    // Update session
    req.session.user = {
      ...req.session.user,
      membership: null
    };

    // Return success with payment ID for confirmation page
    res.json({ 
      success: true,
      paymentId: newPayment._id
    });
  } catch (error) {
    console.error('Error cancelling membership:', error);
    res.status(500).json({ success: false, message: 'Error processing request' });
  }
});

app.post('/purchase-membership', async (req, res) => {
  const { membershipId } = req.body;
  const userId = req.session.user.id;

  try {
    const user = await User.findById(userId);
    const membership = await Membership.findById(membershipId);

    if (!membership) {
      return res.status(400).json({ success: false, message: 'Membership not found' });
    }

    if (!user) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    // Record new payment
    const newPayment = new Payment({
      userId: user._id,
      membershipId: membership._id,
      amount: membership.price,
      status: 'completed',
    });
    await newPayment.save();

    // Update user's membership
    user.membershipPlan = membership._id;
    await user.save();

    // Update session
    const updatedUser = await User.findById(userId).populate('membershipPlan');
    req.session.user = {
      ...req.session.user,
      membership: updatedUser.membershipPlan
    };

    res.json({ 
      success: true,
      paymentId: newPayment._id
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.json({ success: false, message: 'Payment failed' });
  }
});

app.get('/api/payment/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate({
        path: 'membershipId',
        select: 'name description price duration'
      })
      .populate({
        path: 'classId',
        select: 'title instructor time venue price description'
      })
      .populate('userId', 'firstname lastname email contactNumber');
      
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    // If payment has direct class data (from cancellation), use that
    let classData = payment.class;
    
    // Otherwise try to get from populated classId
    if (!classData && payment.classId) {
      classData = {
        title: payment.classId.title,
        instructor: payment.classId.instructor,
        time: payment.classId.time,
        venue: payment.classId.venue,
        price: payment.classId.price,
        description: payment.classId.description
      };
      
      // Try to find booking to get specific date
      const booking = await Booking.findOne({
        user: payment.userId,
        class: payment.classId._id
      }).sort({ updatedAt: -1 });
      
      if (booking) {
        classData.date = booking.classDate;
      }
    }
    
    res.json({
      _id: payment._id,
      status: payment.status,
      paymentDate: payment.paymentDate,
      amount: payment.amount,
      membership: payment.membershipId,
      class: classData,
      user: payment.userId ? {
        firstname: payment.userId.firstname,
        lastname: payment.userId.lastname,
        email: payment.userId.email,
        contactNumber: payment.userId.contactNumber
      } : null
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ error: 'Server error' });
  }
});