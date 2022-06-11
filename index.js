const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
const app = express();

//middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ldsyr.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();

        const serviceCollection = client.db('doctors-portal').collection('service');
        const bookingCollection = client.db('doctors-portal').collection('booking');

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/available' , async (req, res) =>{
            const date = req.query.date;
            // step:1(get all services)
            const services = await serviceCollection.find().toArray();

            //step:2(get all bookings of that day)
            const filter = {date: date};
            const bookings = await bookingCollection.find(filter).toArray();

            //step:3(search bookings for a service)
            services.forEach(service =>{
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                const bookedSlots = serviceBookings.map(book => book.slot);
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                service.slots = available;
            })

            res.send(services);
        })

        /**
         * Api naming convention
         * app.get('/booking') ; get all booking in this api or get more than one by query/filter
         * app.get('/booking/:id'); get a specific booking 
         * app.post('/booking') ; add a new booking
         * app.patch('/booking/:id') ; update a specific booking
         * app.delete('/booking/:id') ; delete a specific booking
         **/
        app.get('/booking', async (req, res) =>{
            const email = req.query.email;
            const query = {patient: email};
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings)
        }) 

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if(exists){
                return res.send({success: false, exists});
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({success: true, result});
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