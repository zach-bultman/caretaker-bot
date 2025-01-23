require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ]
});
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const Database = require('better-sqlite3');
const schedule = require('node-schedule');
const moment = require('moment-timezone');


// Action history stack to store the last action
let lastAction = null;

// Advanced Content Moderation (Deletes messages from ALL users, including Admins and Moderators)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // List of banned words (case-insensitive)
  const bannedWords = ['Cunt', 'Faggot', 'Fag' , 'Slut'];
  const nsfwWords = ['Porn', 'Pussy', 'Cock'];

  // Create a combined regular expression for faster matching
  const badWordRegex = new RegExp(`\\b(${[...bannedWords, ...nsfwWords].join('|')})\\b`, 'i');

  // Check message content against the regex
  if (badWordRegex.test(message.content)) {
    try {
      await message.delete();
      await message.channel.send(`⚠️ ${message.author}, your message was removed due to inappropriate content.`);
    } catch (error) {
      console.error(`Failed to delete message: ${error}`);
    }
  }
});
const db2 = new sqlite3.Database('./discord_riot_ids.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  }
  console.log('Database opened successfully.');

  // Create the `user_riot_ids` table if it does not exist
  db2.run(
    `CREATE TABLE IF NOT EXISTS user_riot_ids (
      discord_id TEXT PRIMARY KEY,
      riot_id TEXT
    )`,
    (err) => {
      if (err) {
        console.error('Error creating table:', err.message);
      } else {
        console.log('Table `user_riot_ids` is ready.');
      }
    }
  )
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.channel.name !== 'bot-commands') return;
  const args = message.content.trim().split(/ +/);
  const command = args.shift().toLowerCase();

  switch (command) {
    case '!help': {
      const helpEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📜 Bot Command Help')
        .setDescription('Available commands:')
        .addFields(
          { name: '🔧 !setup', value: 'Sets up team categories and roles. *(Admin only)*' },
          { name: '📝 !assignrole @user RoleName', value: 'Assigns a role. *(Admin/Moderator only)*' },
          { name: '🗑️ !removerole @user RoleName', value: 'Removes a role. *(Admin/Moderator only)*' },
          { name: '↩️ !undo', value: 'Undoes the last role action. *(Admin/Moderator only)*' },
          { name: '📃 !listroles @user', value: 'Lists user roles.' },
          { name: '📊 !lolstats GameName#Tagline', value: 'Shows LoL stats.' },
          { name: '❌ !deletechannel <channel-name>', value: 'Deletes a channel. *(Admin only)*' },
          { name: '📊 !poll <question> | <option1> | <option2>', value: 'Creates a poll. *(Admin only)*' },
          { name: '🎤 !tempvc', value: 'Creates a temporary voice channel for 5 hours.' },
          { name: '🎮 !teaminfo <teamname>', value: 'Shows the players of the team' },
          { name: '🗓️ !schedule add <YYYY-MM-DD> <HH:MM> <event details>', value: 'Adds an event to the calender' },
          { name: '🗓️ !schedule modify <event ID> <YYYY-MM-DD> <HH:MM> <new details>', value: 'Modifies an existing event in the calendar' },
          { name: '🗓️ !schedule show (posts in the schedule channel)', value: 'Posts the schedule in schedule channel' },
          { name: '🗓️ !schedule delete <event ID>', value: 'Deletes an event from the calendar, events past the date will automatically expire' },
          
        )
        .setFooter({ text: 'Use responsibly in #bot-commands.' })
        .setTimestamp();
      await message.channel.send({ embeds: [helpEmbed] });
      await message.delete();
      break;
    }

    case '!assignrole': {
      if (!message.member.roles.cache.some(role => ['Admin', 'Moderator'].includes(role.name))) return;
      const member = message.mentions.members.first();
      const roleName = args.slice(1).join(' ');
      const role = message.guild.roles.cache.find(r => r.name === roleName);
      if (member && role) {
        await member.roles.add(role);
        lastAction = { type: 'assignRole', userId: member.id, roleId: role.id };
        await message.channel.send(`✅ Assigned **${roleName}** to ${member}`);
      }
      await message.delete();
      break;
    }

    case '!linkriot': {
      const args = message.content.split(' ').slice(1); // Get everything after the command
    const subcommand = args[0]?.toLowerCase(); // Get the first argument as subcommand
    const discordId = message.author.id;

    if (!subcommand) {
      message.reply('Please provide a subcommand: `!linkriot add <riot_id>`, `!linkriot remove`, or `!linkriot change <new_riot_id>`');
      return;
    }

    switch (subcommand) {
      case 'add': {
        const riotId = args.slice(1).join(' '); // Get the Riot ID
        if (!riotId) {
          message.reply('Please provide your Riot ID. Usage: `!linkriot add <riot_id>`');
          return;
        }

        db2.get('SELECT * FROM user_riot_ids WHERE discord_id = ?', [discordId], (err, row) => {
          if (err) {
            console.error('Error querying the database:', err);
            return;
          }

          if (row) {
            message.reply(`Your Riot ID is already linked as: ${row.riot_id}. Use \`!linkriot change <new_riot_id>\` to update it.`);
          } else {
            db2.run('INSERT INTO user_riot_ids (discord_id, riot_id) VALUES (?, ?)', [discordId, riotId], (err) => {
              if (err) {
                console.error('Error inserting into database:', err);
                return;
              }
              message.reply(`Your Riot ID has been successfully linked: ${riotId}`);
            });
          }
        });
        break;
      }
      case 'remove': {
        db2.get('SELECT * FROM user_riot_ids WHERE discord_id = ?', [discordId], (err, row) => {
          if (err) {
            console.error('Error querying the database:', err);
            return;
          }

          if (!row) {
            message.reply('You don\'t have a linked Riot ID to remove.');
          } else {
            db2.run('DELETE FROM user_riot_ids WHERE discord_id = ?', [discordId], (err) => {
              if (err) {
                console.error('Error deleting from database:', err);
                return;
              }
              message.reply('Your Riot ID has been successfully removed.');
            });
          }
        });
        break;
      }
      case 'change': {
        const newRiotId = args.slice(1).join(' '); // Get the new Riot ID
        if (!newRiotId) {
          message.reply('Please provide your new Riot ID. Usage: `!linkriot change <new_riot_id>`');
          return;
        }

        db2.get('SELECT * FROM user_riot_ids WHERE discord_id = ?', [discordId], (err, row) => {
          if (err) {
            console.error('Error querying the database:', err);
            return;
          }

          if (!row) {
            message.reply('You don\'t have a linked Riot ID to change. Use `!linkriot add <riot_id>` to link one.');
          } else {
            db2.run('UPDATE user_riot_ids SET riot_id = ? WHERE discord_id = ?', [newRiotId, discordId], (err) => {
              if (err) {
                console.error('Error updating database:', err);
                return;
              }
              message.reply(`Your Riot ID has been successfully updated to: ${newRiotId}`);
            });
          }
        });
        break;
      }
      default: {
        message.reply('Invalid subcommand. Use `add`, `remove`, or `change`.');
      }
    }
    break;
  }

    case '!postform': {
      if (!message.member.roles.cache.some((role) => ['Admin', 'Moderator'].includes(role.name))) {
        return message.reply('❌ You do not have permission to use this command.');
      }
  
      // Extract arguments: !postform <link> <description>
      const args = message.content.split(' ').slice(1);
      const link = args[0];
      const description = args.slice(1).join(' ') || 'Click the link below to fill out the form!';
  
      // Validate the link
      if (!link || !link.startsWith('https://')) {
        return message.reply('❌ Please provide a valid Google Form link (must start with https://).');
      }
  
      // Find the "signups" channel
      const signupChannel = message.guild.channels.cache.find((ch) => ch.name === 'signups');
      if (!signupChannel) {
        return message.reply('❌ No channel named `signups` was found. Please create one first.');
      }
      try {
        // Fetch all messages in the channel and delete any existing embeds
        const messages = await signupChannel.messages.fetch({ limit: 100 }); // Fetch up to 100 recent messages
        const embedMessages = messages.filter((msg) => msg.embeds.length > 0);
    
        for (const [id, msg] of embedMessages) {
          await msg.delete();
        }
      // Create the embed
      const embed = new EmbedBuilder()
        .setColor('#4CAF50') // Custom green color
        .setTitle('📋 New Signup Form Available!') // Embed title
        .setURL(link) // Makes the title clickable
        .setDescription(description) // Main description
        .addFields(
          { name: '📅 Deadline', value: 'January 31, 2025', inline: true }, // Example field
          { name: '🛠️ Organizer', value: 'Event Team', inline: true } // Another example field
          )
        .setThumbnail('https://i.imgur.com/AfFp7pu.png') // Example thumbnail (small image)
        .setImage('https://via.placeholder.com/800x200.png') // Example large image (banner)
        .setFooter({ text: 'Form posted by ' + message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTimestamp(); // Adds the current timestamp
  
      // Send the embed to the "signups" channel
      await signupChannel.send({ embeds: [embed] });
  
      // Confirm the action
      message.reply('✅ Google Form posted in the `signups` channel!');
    } catch (error) {
      console.error('Error handling signups channel:', error);
      message.reply('❌ An error occurred while managing the signups channel. Please try again.');
    }
      break;
    }

    case '!removerole': {
      if (!message.member.roles.cache.some(role => ['Admin', 'Moderator'].includes(role.name))) return;
      const member = message.mentions.members.first();
      const roleName = args.slice(1).join(' ');
      const role = message.guild.roles.cache.find(r => r.name === roleName);
      if (member && role) {
        await member.roles.remove(role);
        lastAction = { type: 'removeRole', userId: member.id, roleId: role.id };
        await message.channel.send(`✅ Removed **${roleName}** from ${member}`);
      }
      await message.delete();
      break;
    }

    case '!undo': {
      if (!lastAction) return;
      const user = await message.guild.members.fetch(lastAction.userId);
      const role = await message.guild.roles.fetch(lastAction.roleId);
      if (lastAction.type === 'assignRole') {
        await user.roles.remove(role);
        await message.channel.send(`↩️ Removed **${role.name}** from ${user}`);
      } else if (lastAction.type === 'removeRole') {
        await user.roles.add(role);
        await message.channel.send(`↩️ Re-added **${role.name}** to ${user}`);
      }
      lastAction = null;
      await message.delete();
      break;
    }

    case '!listroles': {
      const member = message.mentions.members.first() || message.member;
      const roles = member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ');
      await message.channel.send(`**${member.user.username}** has roles: ${roles || 'No roles'}`);
      await message.delete();
      break;
    }

    case '!poll': {
      const [question, ...choices] = message.content.slice(6).split('|').map(str => str.trim());
      if (choices.length < 2) return;
      const pollEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(question)
        .setDescription(choices.map((choice, i) => `${String.fromCharCode(65 + i)}. ${choice}`).join('\n'))
        .setTimestamp();
      const pollMessage = await message.channel.send({ embeds: [pollEmbed] });
      const reactions = ['🇦', '🇧', '🇨', '🇩'];
      for (let i = 0; i < choices.length; i++) await pollMessage.react(reactions[i]);
      await message.delete();
      break;
    }

    case '!deletechannel': {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
      const channelName = args[0];
      const channel = guild.channels.cache.find(ch => ch.name === channelName);
      if (channel) {
        await channel.delete();
        await message.channel.send(`Deleted channel: ${channelName}`);
      } else {
        await message.channel.send(`Channel not found: ${channelName}`);
      }
      break;
    }

    case '!deletecategory': {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
      const categoryName = args[0];
      const category = guild.channels.cache.find(ch => ch.name === categoryName && ch.type === 4);
      if (category) {
        for (const channel of category.children.cache.values()) await channel.delete();
        await category.delete();
        await message.channel.send(`Deleted category: ${categoryName}`);
      } else {
        await message.channel.send(`Category not found: ${categoryName}`);
      }
      break;
    }

    case '!deleterole': {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
      const roleName = args[0];
      const role = guild.roles.cache.find(r => r.name === roleName);
      if (role) {
        await role.delete();
        await message.channel.send(`Deleted role: ${roleName}`);
      } else {
        await message.channel.send(`Role not found: ${roleName}`);
      }
      break;
    }

    case '!teaminfo': {
      const args = message.content.split(' ').slice(1);
      const teamName = args[0];
    
      const validTeams = ['Meow', 'Woof', 'Purr', 'Moo'];
      if (!teamName || !validTeams.includes(teamName)) {
        return message.reply(`❌ Please provide a valid team name: ${validTeams.join(', ')}`);
      }
    
      try {
        // Force fetching the latest roles to avoid stale cache
        await message.guild.members.fetch();
    
        const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === teamName.toLowerCase());
        if (!role) {
          return message.reply(`❌ Role for team **${teamName}** not found.`);
        }
    
        // Fetch all members with the role (ensuring it's up-to-date)
        const teamMembers = role.members.map(member => `🎮 ${member.displayName}`);
    
        if (teamMembers.length === 0) {
          return message.reply(`❌ No members found in **${teamName}** team.`);
        }
    
        const gamingEffects = {
          Meow: '🐾',
          Woof: '🐶',
          Purr: '😼',
          Moo: '🐄'
        };
    
        const embed = new EmbedBuilder()
          .setColor('#FF4500')
          .setTitle(`${gamingEffects[teamName]} Team ${teamName}`)
          .setDescription(teamMembers.join('\n'))  // List all members
          .setThumbnail('https://i.imgur.com/AfFp7pu.png') // Replace with a gaming-themed icon
          .setFooter({ text: 'Team Info', iconURL: 'https://cdn-icons-png.flaticon.com/512/168/168882.png' })
          .setTimestamp();
    
        await message.channel.send({ embeds: [embed] });
    
      } catch (error) {
        console.error('❌ Error fetching team info:', error);
        message.reply('❌ An error occurred while fetching the team info. Please try again.');
      }
    }

  }});

// Setup Command
client.on('messageCreate', async (message) => {
  if (message.content === '!setup' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const guild = message.guild;
  
      // Create Admin and Moderator Roles
      const roles = [
        { name: 'Admin', color: 'Red', permissions: [PermissionsBitField.Flags.Administrator] },
        { name: 'Moderator', color: 'Blue', permissions: [PermissionsBitField.Flags.KickMembers, PermissionsBitField.Flags.ManageMessages] }
      ];
  
      let createdRoles = {};
  
      // Create Admin and Moderator roles or overwrite if they already exist
      for (const roleData of roles) {
        let role = guild.roles.cache.find(r => r.name === roleData.name);
        if (role) {
          await role.setColor(roleData.color);  // Overwrite the color if the role exists
          await role.setPermissions(roleData.permissions);  // Update permissions
          createdRoles[roleData.name] = role;
          await message.channel.send(`Updated existing role: ${roleData.name}`);
        } else {
          role = await guild.roles.create({
            name: roleData.name,
            color: roleData.color,
            permissions: roleData.permissions
          });
          createdRoles[roleData.name] = role;
          await message.channel.send(`Created role: ${roleData.name}`);
        }
      }
  
      // Team-specific colors
      const teamColors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1']; // Unique colors for each team
  
      // Create Team Categories with Unique Roles and Permissions
      const teams = ['Team1', 'Team2', 'Team3', 'Team4'];
  
      for (let i = 0; i < teams.length; i++) {
        const team = teams[i];
        const teamColor = teamColors[i];
  
        // Check if the team role already exists, otherwise create it
        let teamRole = guild.roles.cache.find(role => role.name === `${team}-Role`);
        if (teamRole) {
          await teamRole.setColor(teamColor); // Overwrite the color
          createdRoles[team] = teamRole;
          await message.channel.send(`Updated existing role: ${team}-Role with new color.`);
        } else {
          teamRole = await guild.roles.create({
            name: `${team}-Role`,
            color: teamColor, // Assign a unique color
            permissions: [PermissionsBitField.Flags.ViewChannel]
          });
          createdRoles[team] = teamRole;
          await message.channel.send(`Created role: ${team}-Role`);
        }
  
        // Check if the category already exists, otherwise create it
        let category = guild.channels.cache.find(ch => ch.name === team && ch.type === 4);
        if (!category) {
          category = await guild.channels.create({
            name: team,
            type: 4, // Category
            permissionOverwrites: [
              {
                id: guild.roles.everyone,
                deny: [PermissionsBitField.Flags.ViewChannel]
              },
              {
                id: createdRoles['Admin'].id,
                allow: [PermissionsBitField.Flags.ViewChannel]
              },
              {
                id: createdRoles['Moderator'].id,
                allow: [PermissionsBitField.Flags.ViewChannel]
              },
              {
                id: teamRole.id,
                allow: [PermissionsBitField.Flags.ViewChannel]
              }
            ]
          });
          await message.channel.send(`Created ${team} category with exclusive access.`);
        } else {
          // Delete existing channels in the category before creating new ones
          for (const channel of category.children.cache.values()) {
            await channel.delete();
          }
          await category.setName(team);  // Recreate the category with the same name
          await message.channel.send(`Deleted old channels and recreated category: ${team}`);
        }
  
        // Create 1 Voice Channel in the category
        await guild.channels.create({
          name: `${team}-Voice`,
          type: 2, // Voice Channel
          parent: category.id
        });
  
        // Create 4 Text Channels in the category
        for (let i = 1; i <= 4; i++) {
          await guild.channels.create({
            name: `${team}-text-${i}`,
            type: 0, // Text Channel
            parent: category.id
          });
        }
      }
  
      await message.channel.send('All teams and permissions have been set up successfully!');
    }
  });  

  // Database setup
  const db4 = new sqlite3.Database('./discord_riot_ids.db');
  const riotApi = 'RIOT_API_KEY';
  const TIME_ZONE = 'America/New_York';
  
  
  schedule.scheduleJob({ hour: 23, minute: 59, dayOfWeek: 0, tz: TIME_ZONE }, async () => {
    const guild = client.guilds.cache.first(); // Adjust this if multiple guilds are used
    if (!guild) return console.log('No guild found.');

    const channel = guild.channels.cache.find(ch => ch.name === 'league-stats'); // Update to your desired channel
    if (!channel) return console.log('No channel named `league-stats` found.');

    db.all('SELECT * FROM discord_riot_ids', async (err, rows) => {
        if (err) return console.error('Database error:', err);
        if (!rows.length) return channel.send('No players linked to Riot IDs.');

        for (const row of rows) {
            try {
                const { discord_id, riot_id } = row;

                // Calculate start and end of the week in ET
                const now = moment.tz(TIME_ZONE);
                const startOfWeek = now.clone().startOf('week').tz(TIME_ZONE);
                const endOfWeek = now.clone().endOf('week').tz(TIME_ZONE);

                const startOfWeekISO = startOfWeek.toISOString();
                const endOfWeekISO = endOfWeek.toISOString();

                // Fetch ranked games for the week
                const rankedGames = await riotApi.getRankedGames(riot_id, startOfWeekISO, endOfWeekISO);

                if (!rankedGames || rankedGames.length === 0) {
                    channel.send(`<@${discord_id}> No ranked games played this week.`);
                    continue;
                }

                // Find the best performance
                const bestGame = rankedGames.reduce((best, game) => {
                    const currentKDA = (game.kills + game.assists) / Math.max(1, game.deaths);
                    const bestKDA = (best.kills + best.assists) / Math.max(1, best.deaths);
                    return currentKDA > bestKDA ? game : best;
                });

                // Format the message with ET
                const bestGameTime = moment.tz(bestGame.timestamp, TIME_ZONE).format('MMMM Do YYYY, h:mm A');
                const embed = {
                    title: `📈 Weekly Best Performance for ${bestGame.summonerName}`,
                    description: `Your best game this week was played on **${bestGameTime} (ET)**.`,
                    fields: [
                        { name: 'Champion', value: bestGame.champion, inline: true },
                        { name: 'K/D/A', value: `${bestGame.kills}/${bestGame.deaths}/${bestGame.assists}`, inline: true },
                        { name: 'KDA Ratio', value: ((bestGame.kills + bestGame.assists) / Math.max(1, bestGame.deaths)).toFixed(2), inline: true }
                    ],
                    footer: { text: 'All times are in Eastern Time (ET).' },
                    timestamp: new Date(),
                };

                channel.send({ content: `<@${discord_id}> Here's your best performance!`, embeds: [embed] });
            } catch (error) {
                console.error('Error fetching ranked games:', error);
            }
        }
    });
});
 
  

const VERIFICATION_CHANNEL_NAME = 'zoe-commands'; // The channel where users must verify
const VERIFICATION_PHRASE = '/done';      // The phrase users must type to verify
const UNVERIFIED_ROLE_NAME = 'Unverified';  // Role assigned to new users
const VERIFIED_ROLE_NAME = 'Member';        // Role given after verification

// Assign 'Unverified' role to new members
client.on('guildMemberAdd', async (member) => {
  const guild = member.guild;

  // Check if the Unverified role exists
  let unverifiedRole = guild.roles.cache.find(role => role.name === UNVERIFIED_ROLE_NAME);
  if (!unverifiedRole) {
    // Create the Unverified role if it doesn't exist
    unverifiedRole = await guild.roles.create({
      name: UNVERIFIED_ROLE_NAME,
      color: 'Grey',
      permissions: []
    });
    console.log(`Created role: ${UNVERIFIED_ROLE_NAME}`);
  }

  // Assign the Unverified role to the new member
  await member.roles.add(unverifiedRole);

  // Send a DM to the new member explaining how to verify
  try {
    await member.send(`Welcome to **${guild.name}**! Please go to the **#${VERIFICATION_CHANNEL_NAME}** channel and type /register and then **"${VERIFICATION_PHRASE}"** to verify and gain access to the server.`);
  } catch (err) {
    console.error(`Couldn't send DM to ${member.user.tag}`);
  }
});

// Listen for messages in the verification channel
client.on('messageCreate', async (message) => {
  if (message.author.bot) return; // Ignore bot messages

  const guild = message.guild;
  const member = message.member;

  // Check if the message is in the verification channel
  if (message.channel.name === VERIFICATION_CHANNEL_NAME) {
    if (message.content.toLowerCase() === VERIFICATION_PHRASE.toLowerCase()) {
      // Fetch roles
      const verifiedRole = guild.roles.cache.find(role => role.name === VERIFIED_ROLE_NAME);
      const unverifiedRole = guild.roles.cache.find(role => role.name === UNVERIFIED_ROLE_NAME);

      // Create Verified role if it doesn't exist
      let memberRole = verifiedRole;
      if (!verifiedRole) {
        memberRole = await guild.roles.create({
          name: VERIFIED_ROLE_NAME,
          color: 'Green',
          permissions: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel],
        });
        console.log(`Created role: ${VERIFIED_ROLE_NAME}`);
      }

      // Assign Verified role and remove Unverified role
      await member.roles.add(memberRole);
      if (unverifiedRole) {
        await member.roles.remove(unverifiedRole);
      }

      // Confirm verification
      await message.reply(`✅ You are now verified! Enjoy the server!`);

      // Optionally, delete the verification message to keep the channel clean
      setTimeout(() => message.delete(), 5000);
    } else {
      // If the wrong phrase is entered
      await message.reply(`❌ Incorrect verification phrase. Please type **"${VERIFICATION_PHRASE}"** to verify.`);
      setTimeout(() => message.delete(), 5000);
    }
  }
});


client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!tempvc') || message.author.bot) return;const category = message.channel.parent;
  if (!category) return message.reply('⚠️ Use this command under a category.');
  const memberRole = message.guild.roles.cache.find(role => role.name === VERIFIED_ROLE_NAME);
  const tempChannel = await message.guild.channels.create({
    name: `Temp VC - ${category.name}`,
    type: 2,
    parent: category.id,
    permissionOverwrites: [
      { id: memberRole.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
      { id: message.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }
    ]
  });
  await message.reply(`🎤 Temporary voice channel created!`);
  setTimeout(() => tempChannel.delete().catch(console.error), 5 * 60 * 60 * 1000);
  
});

// Schedule commands
// Initialize SQLite database
const db = new Database('./schedule.db');

// Create the table if it doesn't exist
db.prepare(`
    CREATE TABLE IF NOT EXISTS schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        details TEXT NOT NULL,
        event_date TEXT NOT NULL,
        event_time TEXT NOT NULL
    )
`).run();

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!schedule') || message.author.bot) return;

  const args = message.content.split(' ').slice(1);
  const subcommand = args[0];

  // Ensure the command is used in the "bot-commands" channel
  if (message.channel.name !== 'bot-commands') {
      return message.reply('❌ You can only use this command in the `bot-commands` channel.');
  }

  const adminRole = message.guild.roles.cache.find(role => role.name === 'Admin');
  const modRole = message.guild.roles.cache.find(role => role.name === 'Moderator');
  if (
      (!adminRole || !message.member.roles.cache.has(adminRole.id)) &&
      (!modRole || !message.member.roles.cache.has(modRole.id))
  ) {
      return message.reply('❌ You need the `Admin` or `Moderator` role to manage the schedule.');
  }

  // Add an event
  if (subcommand === 'add') {
      const eventDate = args[1];
      const eventTime = args[2];
      const eventDetails = args.slice(3).join(' ');

      if (!eventDate || !eventTime || !eventDetails) {
          return message.reply('❌ Please provide a date (YYYY-MM-DD), time (HH:MM), and details for the event: `!schedule add <YYYY-MM-DD> <HH:MM> <event details>`');
      }

      const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && !isNaN(new Date(eventDate).getTime());
      const isValidTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(eventTime);

      if (!isValidDate) {
          return message.reply('❌ Invalid date format. Please use YYYY-MM-DD.');
      }
      if (!isValidTime) {
          return message.reply('❌ Invalid time format. Please use HH:MM (24-hour format).');
      }

      db.prepare('INSERT INTO schedule (details, event_date, event_time) VALUES (?, ?, ?)').run(eventDetails, eventDate, eventTime);
      const eventId = db.prepare('SELECT last_insert_rowid() AS id').get().id;

      return message.reply(`✅ Event added with ID **${eventId}**: "${eventDetails}" on ${eventDate} at ${eventTime} ET`);
  }

  // Modify an event
  else if (subcommand === 'modify') {
      const eventId = parseInt(args[1]);
      const newDate = args[2];
      const newTime = args[3];
      const newDetails = args.slice(4).join(' ');

      if (!eventId || !newDate || !newTime || !newDetails) {
          return message.reply('❌ Please provide the event ID, new date (YYYY-MM-DD), new time (HH:MM), and new details: `!schedule modify <event ID> <YYYY-MM-DD> <HH:MM> <new details>`');
      }

      const event = db.prepare('SELECT * FROM schedule WHERE id = ?').get(eventId);
      if (!event) {
          return message.reply(`❌ No event found with ID **${eventId}**.`);
      }

      const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(newDate) && !isNaN(new Date(newDate).getTime());
      const isValidTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(newTime);

      if (!isValidDate) {
          return message.reply('❌ Invalid date format. Please use YYYY-MM-DD.');
      }
      if (!isValidTime) {
          return message.reply('❌ Invalid time format. Please use HH:MM (24-hour format).');
      }

      db.prepare('UPDATE schedule SET details = ?, event_date = ?, event_time = ? WHERE id = ?').run(newDetails, newDate, newTime, eventId);
      return message.reply(`✅ Event **${eventId}** updated to: "${newDetails}" on ${newDate} at ${newTime} ET`);
  }

  // Show the schedule
  else if (subcommand === 'show') {
      const scheduleChannel = message.guild.channels.cache.find(ch => ch.name === 'schedule');
      if (!scheduleChannel) {
          return message.reply('❌ Could not find a channel named `schedule`. Please create one first.');
      }

      // Remove expired events
      const now = moment.tz(TIME_ZONE);
      const todayDate = now.format('YYYY-MM-DD');
      const currentTime = now.format('HH:mm');

      db.prepare('DELETE FROM schedule WHERE event_date < ? OR (event_date = ? AND event_time < ?)').run(todayDate, todayDate, currentTime);

      // Fetch active events
      const events = db.prepare('SELECT * FROM schedule ORDER BY event_date, event_time').all();
      if (events.length === 0) {
          return scheduleChannel.send('📅 The schedule is currently empty.');
      }

      const embed = new EmbedBuilder()
          .setTitle('📅 Server Schedule')
          .setColor('#00AAFF')
          .setDescription(events.map(event => `**${event.id}.** ${event.details} - 📅 ${event.event_date} at ${event.event_time} ET`).join('\n'))
          .setFooter({ text: 'Use !schedule add, modify, or show to manage the schedule.' })
          .setTimestamp();

      return scheduleChannel.send({ embeds: [embed] });
  }

  // Delete an event
  else if (subcommand === 'delete') {
      const eventId = parseInt(args[1]);
      if (!eventId) {
          return message.reply('❌ Please provide the event ID to delete: `!schedule delete <event ID>`');
      }

      const event = db.prepare('SELECT * FROM schedule WHERE id = ?').get(eventId);
      if (!event) {
          return message.reply(`❌ No event found with ID **${eventId}**.`);
      }

      db.prepare('DELETE FROM schedule WHERE id = ?').run(eventId);
      return message.reply(`✅ Event **${eventId}** has been deleted.`);
  }

  // Invalid subcommand
  else {
      return message.reply('❌ Invalid subcommand. Use `!schedule add`, `!schedule modify`, `!schedule show`, or `!schedule delete`.');
  }
});

// Schedule event reminders

// Define Eastern Time Zone
const { scheduleJob } = require('node-schedule');
// Schedule job to check for events every minute
scheduleJob('* * * * *', () => {
    const now = moment.tz(TIME_ZONE);
    const thirtyMinutesFromNow = now.clone().add(30, 'minutes');

    const nowDate = now.format('YYYY-MM-DD');
    const nowTime = now.format('HH:mm');
    const thirtyMinutesDate = thirtyMinutesFromNow.format('YYYY-MM-DD');
    const thirtyMinutesTime = thirtyMinutesFromNow.format('HH:mm');

    console.log(`Checking for events scheduled at ${thirtyMinutesDate} ${thirtyMinutesTime} (ET)`);

    const upcomingEvents = db.prepare('SELECT * FROM schedule WHERE event_date = ? AND event_time = ?')
        .all(thirtyMinutesDate, thirtyMinutesTime);

    if (upcomingEvents.length > 0) {
        console.log('Found events:', upcomingEvents);
    } else {
        console.log('No upcoming events found.');
    }

    if (upcomingEvents.length > 0) {
        const guild = client.guilds.cache.first(); // Adjust for specific guild if needed
        if (!guild) return console.error('No guild found.');

        const memberRole = guild.roles.cache.find(role => role.name === 'Member');
        const reminderChannel = guild.channels.cache.find(ch => ch.name === 'schedule');

        if (!reminderChannel || !memberRole) {
            return console.error('Required role or channel not found.');
        }

        upcomingEvents.forEach(event => {
            reminderChannel.send(
                `<@&${memberRole.id}> ⏰ Reminder: **${event.details}** is scheduled for **${event.event_date}** at **${event.event_time} ET**.`
            );
        });
    }
});

const { Sequelize, DataTypes } = require('sequelize');
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DISCORD_CHANNEL_ID = process.env.YOUR_DISCORD_CHANNEL_ID;
const CHANNEL_ID = process.env.YOUR_YOUTUBE_CHANNEL_ID;

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'youtube_videos.sqlite',
});

const Video = sequelize.define('Video', {
  videoId: {
      type: DataTypes.STRING,
      unique: true,
  },
});

// Fetch and post latest videos
async function fetchAndPostVideos() {
  try {
      // Fetch videos from YouTube API
      const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
              part: 'snippet',
              channelId: CHANNEL_ID,
              order: 'date',
              maxResults: 20, // Fetch 20 videos
              key: YOUTUBE_API_KEY,
          },
      });

      const videos = response.data.items;
      if (!videos.length) {
          console.log('No videos found.');
          return;
      }

      // Reverse the video list to post the most recent video last
      const reversedVideos = videos.reverse();

      const discordChannel = await client.channels.fetch(DISCORD_CHANNEL_ID);

      for (const video of reversedVideos) {
          const videoId = video.id.videoId;

          // Check if the video has already been posted
          const existingVideo = await Video.findOne({ where: { videoId } });
          if (existingVideo) {
              console.log(`Video ${videoId} has already been posted.`);
              continue;
          }

          // Save the video ID to the database
          await Video.create({ videoId });

          // Post video link to Discord
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          await discordChannel.send(videoUrl);
          console.log(`Posted video: ${videoUrl}`);
      }
  } catch (error) {
      console.error('Error fetching or posting videos:', error);
  }
}

client.once('ready', async () => {
  console.log(`${client.user.tag} is online!`);
  await sequelize.sync();
  console.log('Database synced.');

  // Automatically fetch and post videos every hour
  setInterval(fetchAndPostVideos, 60 * 60 * 1000);
  fetchAndPostVideos();
});

// Database Setup
const express = require('express');
const TwitchStream = sequelize.define('TwitchStream', {
  streamerName: {
      type: DataTypes.STRING,
      unique: true,
  },
  live: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
  },
});

const TwitchOAuth = sequelize.define('TwitchOAuth', {
  accessToken: {
      type: DataTypes.STRING,
  },
  refreshToken: {
      type: DataTypes.STRING,
  },
  expiry: {
      type: DataTypes.DATE,
  },
});

// Twitch API Configuration
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_DISCORD_CHANNEL_ID = process.env.TWITCH_DISCORD_CHANNEL_ID; // Discord channel to post updates
const STREAMERS = ['caedrel', 'shroud', 'rekkles', 'thebausffs' , 'crownsh0t' , 'lol_nemesis']; // Add Twitch usernames here
const REDIRECT_URI = 'http://localhost:3000/oauth/callback'; // OAuth Redirect URI

// OAuth State and Tokens
let twitchAccessToken = '';
let twitchRefreshToken = '';
let twitchTokenExpiry = null;

// Express Web Server for OAuth
const app = express();

// Route: Home
app.get('/', (req, res) => {
    res.send('Twitch OAuth Integration Bot is running!');
});

// Route: Twitch OAuth Login
app.get('/login', (req, res) => {
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(
        REDIRECT_URI
    )}&response_type=code&scope=channel:read:subscriptions`;
    res.redirect(authUrl);
});

// Route: Twitch OAuth Callback
app.get('/oauth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Authorization code is missing.');
    }

    try {
        const tokenResponse = await axios.post(
            'https://id.twitch.tv/oauth2/token',
            null,
            {
                params: {
                    client_id: TWITCH_CLIENT_ID,
                    client_secret: TWITCH_CLIENT_SECRET,
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: REDIRECT_URI,
                },
            }
        );

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        twitchAccessToken = access_token;
        twitchRefreshToken = refresh_token;
        twitchTokenExpiry = new Date(Date.now() + expires_in * 1000);

        // Save tokens to the database
        await TwitchOAuth.upsert({
            id: 1,
            accessToken: twitchAccessToken,
            refreshToken: twitchRefreshToken,
            expiry: twitchTokenExpiry,
        });

        res.send('Twitch OAuth integration successful! The bot is now authorized.');
    } catch (error) {
        console.error('Error exchanging OAuth code:', error.response?.data || error.message);
        res.status(500).send('Failed to exchange OAuth code. Please try again.');
    }
});

// Refresh Token Function
async function refreshTwitchToken() {
    try {
        const response = await axios.post(
            'https://id.twitch.tv/oauth2/token',
            null,
            {
                params: {
                    client_id: TWITCH_CLIENT_ID,
                    client_secret: TWITCH_CLIENT_SECRET,
                    refresh_token: twitchRefreshToken,
                    grant_type: 'refresh_token',
                },
            }
        );

        const { access_token, refresh_token, expires_in } = response.data;

        twitchAccessToken = access_token;
        twitchRefreshToken = refresh_token;
        twitchTokenExpiry = new Date(Date.now() + expires_in * 1000);

        // Update database
        await TwitchOAuth.upsert({
            id: 1,
            accessToken: twitchAccessToken,
            refreshToken: twitchRefreshToken,
            expiry: twitchTokenExpiry,
        });

        console.log('Twitch token refreshed successfully!');
    } catch (error) {
        console.error('Error refreshing Twitch token:', error.response?.data || error.message);
    }
}

// Check Live Status of Streamers
async function checkLiveStatus() {
    try {
        if (Date.now() >= twitchTokenExpiry) {
            console.log('Refreshing Twitch Access Token...');
            await refreshTwitchToken();
        }

        const response = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                Authorization: `Bearer ${twitchAccessToken}`,
            },
            params: {
                user_login: STREAMERS,
            },
        });

        const liveStreamers = response.data.data;
        const liveStreamerNames = liveStreamers.map((stream) => stream.user_login);

        for (const streamerName of STREAMERS) {
            const isLive = liveStreamerNames.includes(streamerName);

            const streamRecord = await TwitchStream.findOne({ where: { streamerName } });
            if (isLive && (!streamRecord || !streamRecord.live)) {
                const streamData = liveStreamers.find((stream) => stream.user_login === streamerName);
                await postLiveNotification(streamData);

                if (streamRecord) {
                    streamRecord.live = true;
                    await streamRecord.save();
                } else {
                    await TwitchStream.create({ streamerName, live: true });
                }
            } else if (!isLive && streamRecord && streamRecord.live) {
                streamRecord.live = false;
                await streamRecord.save();
            }
        }
    } catch (error) {
        console.error('Error checking Twitch live status:', error.response?.data || error.message);
    }
}

// Post Live Notification to Discord
async function postLiveNotification(streamData) {
    const discordChannel = await client.channels.fetch(TWITCH_DISCORD_CHANNEL_ID);
    const streamUrl = `https://www.twitch.tv/${streamData.user_login}`;

    await discordChannel.send(
        `🎮 **${streamData.user_name}** is now live! 🎥\n\nPlaying: **${streamData.game_name}**\nTitle: **${streamData.title}**\n\nWatch now: ${streamUrl}`
    );

    console.log(`Posted live notification for ${streamData.user_name}`);
}

client.once('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    await sequelize.sync();

    // Load tokens from the database
    const tokens = await TwitchOAuth.findByPk(1);
    if (tokens) {
        twitchAccessToken = tokens.accessToken;
        twitchRefreshToken = tokens.refreshToken;
        twitchTokenExpiry = tokens.expiry;
    } else {
        console.log('No Twitch tokens found. Please authenticate using /login');
    }

    setInterval(checkLiveStatus, 5 * 60 * 1000); // Check every 5 minutes
    await checkLiveStatus();
});

// Start Express server
app.listen(3000, () => {
    console.log('OAuth server running on http://localhost:3000');
});



client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!requestrole')) return;

  // Extract the role name from the command
  const args = message.content.split(' ').slice(1);
  const requestedRoleName = args.join(' ');

  if (!requestedRoleName) {
    return message.reply('❌ Please specify the role you want to request. Usage: `!requestrole <role name>`');
  }

  const requestedRole = message.guild.roles.cache.find((r) => r.name.toLowerCase() === requestedRoleName.toLowerCase());
  if (!requestedRole) {
    return message.reply(`❌ The role **${requestedRoleName}** does not exist.`);
  }

  // Find the "staff" channel
  const staffChannel = message.guild.channels.cache.find((ch) => ch.name === 'moderator-only');
  if (!staffChannel) {
    return message.reply('❌ No channel named `staff` was found. Please create one first.');
  }

  try {
    // Create an interactive button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${message.author.id}_${requestedRole.id}`) // Use unique custom ID
        .setLabel(`Approve Role: ${requestedRole.name}`)
        .setStyle(ButtonStyle.Success)
    );

    // Send the approval request to the "staff" channel
    await staffChannel.send({
      content: `📝 **Role Request**\nUser: ${message.author} has requested the role **${requestedRole.name}**.`,
      components: [row],
    });

    // Confirm to the user
    message.reply(`✅ Your request for the role **${requestedRole.name}** has been sent to the staff.`);
  } catch (error) {
    console.error('Error processing role request:', error);
    message.reply('❌ An error occurred while processing your request. Please try again later.');
  }
});
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return; // Ensure the interaction is a button click

  const [action, userId, roleId] = interaction.customId.split('_'); // Parse the customId

  if (action === 'approve') {
    // Ensure the user clicking the button has permissions
    if (!interaction.member.roles.cache.some((role) => ['Admin', 'Moderator'].includes(role.name))) {
      return interaction.reply({ content: '❌ You do not have permission to approve role requests.', ephemeral: true });
    }

    try {
      // Fetch the guild member and role
      const guildMember = await interaction.guild.members.fetch(userId);
      const role = interaction.guild.roles.cache.get(roleId);

      if (!guildMember || !role) {
        return interaction.reply({
          content: '❌ User or role not found. This request might be outdated or invalid.',
          ephemeral: true,
        });
      }

      // Add the role to the user
      await guildMember.roles.add(role);

      // Update the interaction with success feedback
      await interaction.update({
        content: `✅ **Role Approved:** ${guildMember} has been granted the role **${role.name}**.`,
        components: [], // Remove the button after approval
      });
    } catch (error) {
      console.error('Error approving role request:', error);
      interaction.reply({
        content: '❌ An error occurred while processing the role approval. Please try again.',
        ephemeral: true,
      });
    }
  }
});
console.log(`Server time (ET): ${moment.tz(TIME_ZONE).format('MMMM Do YYYY, h:mm:ss A')} (ET)`);

// Login
client.login(process.env.DISCORD_TOKEN);