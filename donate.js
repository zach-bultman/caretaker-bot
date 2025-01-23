const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const db = new sqlite3.Database('./donations.db');

// Initialize database
db.run(`
    CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        username TEXT,
        amount REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Embed for donation instructions
const donationEmbed = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle('Support Retirement Esports!')
    .setDescription('Donate via PayPal and join the elite "Trust Fund Babies" club!')
    .addFields(
        { name: 'How to Donate', value: 'Use the `/donate` command followed by the amount you wish to contribute!' },
        { name: 'Benefits', value: '💼 Receive the **Trust Fund Babies** role and show off your generosity!' }
    )
    .setFooter({ text: 'Thank you for supporting Retirement Esports!' });

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Send the embed to the 'donate' channel
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const donateChannel = guild.channels.cache.find(channel => channel.name === 'donate');
    if (donateChannel) {
        donateChannel.send({ embeds: [donationEmbed] });
    } else {
        console.log('Donate channel not found. Please create a channel named "donate".');
    }
});

// Function to create a PayPal order
async function createPayPalOrder(amount) {
    const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    try {
        const tokenResponse = await axios.post(
            'https://api-m.sandbox.paypal.com/v1/oauth2/token',
            'grant_type=client_credentials',
            { headers: { Authorization: `Basic ${auth}` } }
        );

        const accessToken = tokenResponse.data.access_token;

        const orderResponse = await axios.post(
            'https://api-m.sandbox.paypal.com/v2/checkout/orders',
            {
                intent: 'CAPTURE',
                purchase_units: [
                    {
                        amount: {
                            currency_code: 'USD',
                            value: amount.toFixed(2),
                        },
                    },
                ],
            },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        return orderResponse.data;
    } catch (error) {
        console.error('PayPal Order Creation Error:', error.response.data);
        throw new Error('Failed to create PayPal order.');
    }
}

// Donation command
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member } = interaction;

    if (commandName === 'donate') {
        const amount = options.getNumber('amount');
        if (amount <= 0) {
            return interaction.reply({ content: 'Please enter a valid donation amount.', ephemeral: true });
        }

        try {
            const order = await createPayPalOrder(amount);
            const approvalLink = order.links.find(link => link.rel === 'approve').href;

            interaction.reply({
                content: `Thank you for your generosity! Please complete your donation by clicking the link below:\n[Donate Now](${approvalLink})`,
                ephemeral: true,
            });

            // Store donation details in the database (pending status)
            db.run(
                `INSERT INTO donations (user_id, username, amount) VALUES (?, ?, ?)`,
                [member.id, member.user.username, amount],
                err => {
                    if (err) console.error('Database Error:', err);
                }
            );

            console.log(`Donation link sent to ${member.user.username}: ${approvalLink}`);
        } catch (error) {
            interaction.reply({ content: 'An error occurred while creating your donation. Please try again later.', ephemeral: true });
        }
    }
});

// Command registration
client.on('ready', async () => {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    await guild.commands.set([
        {
            name: 'donate',
            description: 'Donate to Retirement Esports via PayPal and receive the Trust Fund Babies role!',
            options: [
                {
                    name: 'amount',
                    type: 10, // Number
                    description: 'Amount to donate',
                    required: true,
                },
            ],
        },
    ]);

    console.log('Commands registered.');
});
