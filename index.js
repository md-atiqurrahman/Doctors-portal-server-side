const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const port = process.env.PORT || 5000;
const app = express();
const nodemailer = require('nodemailer');
const mg = require('nodemailer-mailgun-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

//middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ldsyr.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    })
};

const auth = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY,
        domain: 'sandboxac8531a7788347d5ab6e5bcb47f99250.mailgun.org',
    }
};

const nodemailerMailgun = nodemailer.createTransport(mg(auth));

function sendAppointmentEmail(booking) {
    const { treatment, date, slot, patient, patientName } = booking;

    const email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `Your appointment for ${treatment} is on ${date} at ${slot}  is confirmed`,
        text: `Your appointment for ${treatment} is on ${date} at ${slot}  is confirmed`,
        html: `
        <div>
            <p>Hello ${patientName},</p>
            <h3>Your appointment for ${treatment} is confirmed </h3>
            <p>Looking forward to seeing you on ${date} at ${slot}</p>


              <h3>Our address</h3>
              <p>Pirgonj Pourosova,Rangpur</p>
              <p>Bangladesh</p>
              <a href='https://www.programming-hero.com/'>unsubscribe</a>
        </div>
        `
    };

    nodemailerMailgun.sendMail(email, (err, info) => {
        if (err) {
            console.log(err);
        }
        else {
            console.log(info);
        }
    });
}

async function run() {
    try {
        await client.connect();

        const serviceCollection = client.db('doctors-portal').collection('service');
        const bookingCollection = client.db('doctors-portal').collection('booking');
        const userCollection = client.db('doctors-portal').collection('users');
        const doctorCollection = client.db('doctors-portal').collection('doctors');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            next();
        }


        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/available', async (req, res) => {
            const date = req.query.date;
            // step:1(get all services)
            const services = await serviceCollection.find().toArray();

            //step:2(get all bookings of that day)
            const filter = { date: date };
            const bookings = await bookingCollection.find(filter).toArray();

            //step:3(search bookings for a service)
            services.forEach(service => {
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                const bookedSlots = serviceBookings.map(book => book.slot);
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                service.slots = available;
            })

            res.send(services);
        });

        app.post('/create-payment-intent',verifyJWT, async (req, res ) =>{
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
 
            const paymentIntent = await stripe.paymentIntents.create({
             amount: amount,
             currency: 'usd',
             payment_method_types: ['card']
            })
 
            res.send({clientSecret: paymentIntent.client_secret})
         });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        app.put('/users/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            }
            const result = await userCollection.updateOne(filter, updateDoc);
            return res.send(result);
        })

        app.get('/users', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })


        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, options);

            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

            res.send({ result, token });
        })

        /**
         * Api naming convention
         * app.get('/booking') ; get all booking in this api or get more than one by query/filter
         * app.get('/booking/:id'); get a specific booking 
         * app.post('/booking') ; add a new booking
         * app.patch('/booking/:id') ; update a specific booking
         * app.put('/booking/:id') ; update(if exists) or insert (if not exists) that means upsert a booking
         * app.delete('/booking/:id') ; delete a specific booking
         **/
        app.get('/booking', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (decodedEmail === email) {
                const query = { patient: email };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings)
            }
            return res.status(403).send({ message: 'Forbidden access' });

        });

        app.get('/booking/:id',verifyJWT, async (req, res) =>{
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, exists });
            }
            const result = await bookingCollection.insertOne(booking);
            console.log('sending email')
            sendAppointmentEmail(booking);
            return res.send({ success: true, result });
        });

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        })

        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        });

        app.delete('/doctors/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        })

    }
    finally {
        //  await client.close();
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Doctors server is running');
});
app.listen(port, () => {
    console.log('Doctors app listening on port', port)
})