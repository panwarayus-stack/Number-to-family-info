export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      message: '❌ Method not allowed' 
    });
  }

  try {
    const { number, debug } = req.query;

    if (!number) {
      return res.status(400).json({
        success: false,
        message: '📱 Mobile number is required. Usage: /api/fetchdata?number=MOBILE_NUMBER'
      });
    }

    // Validate mobile number format
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(number)) {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid mobile number format. Please provide a valid 10-digit Indian mobile number.'
      });
    }

    console.log(`🔍 Searching for mobile: ${number}`);

    // Step 1: Get mobile info from first API
    const mobileApiUrl = `https://allapiinone.vercel.app/?key=DEMOKEY&type=mobile&term=${number}`;
    console.log(`📡 Calling Mobile API: ${mobileApiUrl}`);
    
    const mobileResponse = await fetch(mobileApiUrl);
    
    if (!mobileResponse.ok) {
      console.log(`❌ Mobile API Error: ${mobileResponse.status}`);
      return res.status(500).json({
        success: false,
        message: '🔍 Mobile lookup service unavailable',
        debug: debug ? `HTTP ${mobileResponse.status}` : undefined
      });
    }

    const mobileData = await mobileResponse.json();
    console.log(`📱 Mobile API Response:`, JSON.stringify(mobileData, null, 2));

    if (!mobileData.success) {
      return res.status(404).json({
        success: false,
        message: '📭 No data found for this mobile number',
        debug: debug ? mobileData : undefined
      });
    }

    if (!mobileData.result || mobileData.result.length === 0) {
      return res.status(404).json({
        success: false,
        message: '📭 Mobile number not found in database',
        debug: debug ? 'Empty result array' : undefined
      });
    }

    const usersData = mobileData.result;
    console.log(`👥 Found ${usersData.length} user(s) for this mobile`);

    let familyData = null;
    let successfulUserData = null;
    let triedUsers = [];

    // Try each user until we get successful family data
    for (const userData of usersData) {
      const aadhaarNumber = userData.id_number;
      console.log(`🔑 Processing user: ${userData.name}, Aadhaar: ${aadhaarNumber ? 'Yes' : 'No'}`);

      if (!aadhaarNumber) {
        triedUsers.push({ name: userData.name, status: '❌ No Aadhaar linked' });
        continue;
      }

      // Validate Aadhaar format (12 digits)
      if (!/^\d{12}$/.test(aadhaarNumber)) {
        triedUsers.push({ name: userData.name, status: '❌ Invalid Aadhaar format' });
        continue;
      }

      try {
        // Step 2: Get family info from second API
        const familyApiUrl = `https://adhar-family.vercel.app/fetch?key=paidchx&aadhaar=${aadhaarNumber}`;
        console.log(`🏠 Calling Family API for Aadhaar: ${aadhaarNumber}`);
        
        const familyResponse = await fetch(familyApiUrl);
        
        if (!familyResponse.ok) {
          console.log(`❌ Family API HTTP Error: ${familyResponse.status}`);
          triedUsers.push({ name: userData.name, status: '❌ Family API error' });
          continue;
        }

        const familyResponseData = await familyResponse.json();
        console.log(`🏠 Family API Response:`, JSON.stringify(familyResponseData, null, 2));

        // Check if the response indicates "Ration card not found"
        if (familyResponseData.respCode === "214" || 
            familyResponseData.respMessage === "Ration card not found in IMPDS") {
          console.log(`❌ Ration card not found for Aadhaar: ${aadhaarNumber}`);
          triedUsers.push({ name: userData.name, status: '📭 No ration card found' });
          continue;
        }

        if (!familyResponseData.memberDetailsList) {
          console.log(`❌ No member details in family response`);
          triedUsers.push({ name: userData.name, status: '📭 No family data available' });
          continue;
        }

        // If we get here, we have successful family data
        familyData = familyResponseData;
        successfulUserData = userData;
        triedUsers.push({ name: userData.name, status: '✅ Family data found' });
        console.log(`🎉 Successfully found family data for: ${userData.name}`);
        break; // Exit the loop once we find successful data

      } catch (error) {
        console.log(`❌ Family API Exception: ${error.message}`);
        triedUsers.push({ name: userData.name, status: '❌ Connection error' });
        continue;
      }
    }

    // If no family data found for any user
    if (!familyData) {
      console.log(`❌ No family data found for any user`);
      return res.status(404).json({
        success: false,
        message: '👨‍👩‍👧‍👦 Family data not found for this mobile number',
        search_details: {
          mobile_number: number,
          total_users_found: usersData.length,
          users_with_aadhaar: usersData.filter(user => user.id_number).length,
          search_status: 'completed',
          tried_users: triedUsers
        },
        available_users: usersData.map(user => ({
          name: `👤 ${user.name}`,
          mobile: `📱 ${user.mobile}`,
          father_name: `👨 ${user.father_name || 'Not available'}`,
          address: `🏠 ${formatAddress(user.address)}`,
          circle: `📶 ${user.circle}`,
          has_aadhaar: user.id_number ? '✅ Yes' : '❌ No'
        })),
        debug: debug ? { 
          raw_mobile_data: usersData,
          tried_users: triedUsers 
        } : undefined
      });
    }

    // Get relationship emoji
    const getRelationshipEmoji = (relationship) => {
      const emojiMap = {
        'SELF': '👤',
        'HUSBAND': '👨',
        'WIFE': '👩',
        'SON': '👦',
        'DAUGHTER': '👧',
        'FATHER': '👴',
        'MOTHER': '👵',
        'BROTHER': '👨',
        'SISTER': '👩',
        'GRANDFATHER': '👴',
        'GRANDMOTHER': '👵'
      };
      return emojiMap[relationship] || '👤';
    };

    // Format the successful response
    const formattedResponse = {
      success: true,
      message: '✅ Data retrieved successfully',
      
      personal_info: {
        title: '👤 Personal Information',
        data: {
          name: `🧾 ${successfulUserData.name}`,
          mobile_number: `📱 ${successfulUserData.mobile}`,
          father_name: `👨 ${successfulUserData.father_name || 'Not available'}`,
          alternate_mobile: `📞 ${successfulUserData.alt_mobile || 'Not available'}`,
          telecom_circle: `📶 ${successfulUserData.circle}`,
          email: `📧 ${successfulUserData.email || 'Not available'}`,
          address: `🏠 ${formatAddress(successfulUserData.address)}`
        }
      },

      family_details: {
        title: '👨‍👩‍👧‍👦 Family Details',
        data: {
          family_address: `📍 ${familyData.address}`,
          district: `🏛️ ${familyData.homeDistName}`,
          state: `🗺️ ${familyData.homeStateName}`,
          pincode: `📮 ${extractPincode(familyData.address)}`,
          scheme: `📋 ${familyData.schemeName || 'Not available'}`,
          total_family_members: `👥 ${familyData.memberDetailsList.length} members`
        }
      },

      family_members: {
        title: '👪 Family Members List',
        members: familyData.memberDetailsList.map(member => ({
          name: `${getRelationshipEmoji(member.releationship_name)} ${member.memberName.trim()}`,
          relationship: `🔗 ${member.releationship_name}`,
          uid_status: member.uid === 'Yes' ? '✅ UID Verified' : '❌ UID Not Verified'
        }))
      },

      search_summary: {
        title: '📊 Search Summary',
        data: {
          mobile_searched: `🔍 ${number}`,
          total_users_found: `👥 ${usersData.length} user(s)`,
          successful_match: `✅ ${successfulUserData.name}`,
          total_family_members: `👪 ${familyData.memberDetailsList.length} members`,
          search_timestamp: `⏰ ${new Date().toLocaleString()}`
        }
      }
    };

    console.log(`🎯 Success response sent for: ${number}`);
    res.status(200).json(formattedResponse);

  } catch (error) {
    console.error('💥 Unhandled Error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Internal server error',
      suggestion: 'Please try again with a valid mobile number',
      debug: debug ? error.message : undefined
    });
  }
}

// Helper function to format address
function formatAddress(address) {
  if (!address) return 'Not available';
  
  try {
    const addressParts = address.split('!').filter(part => part.trim() !== '');
    return addressParts.join(', ');
  } catch (error) {
    return address || 'Not available';
  }
}

// Helper function to extract pincode from address
function extractPincode(address) {
  if (!address) return 'Not available';
  
  const pincodeMatch = address.match(/\b\d{6}\b/);
  return pincodeMatch ? pincodeMatch[0] : 'Not available';
}
