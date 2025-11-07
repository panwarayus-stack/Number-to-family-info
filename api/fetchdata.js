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
    const { number } = req.query;

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

    // Step 1: Get mobile info from first API
    const mobileApiUrl = `https://allapiinone.vercel.app/?key=DEMOKEY&type=mobile&term=${number}`;
    
    const mobileResponse = await fetch(mobileApiUrl);
    
    if (!mobileResponse.ok) {
      return res.status(500).json({
        success: false,
        message: '🔍 Unable to fetch mobile information at the moment'
      });
    }

    const mobileData = await mobileResponse.json();

    if (!mobileData.success || !mobileData.result || mobileData.result.length === 0) {
      return res.status(404).json({
        success: false,
        message: '📭 No data found for the provided mobile number'
      });
    }

    const usersData = mobileData.result;
    let familyData = null;
    let successfulUserData = null;
    let triedUsers = [];

    // Try each user until we get successful family data
    for (const userData of usersData) {
      const aadhaarNumber = userData.id_number;

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
        
        const familyResponse = await fetch(familyApiUrl);
        
        if (!familyResponse.ok) {
          triedUsers.push({ name: userData.name, status: '❌ Family API error' });
          continue;
        }

        const familyResponseData = await familyResponse.json();

        // Check if the response indicates "Ration card not found"
        if (familyResponseData.respCode === "214" || 
            familyResponseData.respMessage === "Ration card not found in IMPDS" ||
            !familyResponseData.memberDetailsList) {
          triedUsers.push({ name: userData.name, status: '📭 No family data found' });
          continue;
        }

        // If we get here, we have successful family data
        familyData = familyResponseData;
        successfulUserData = userData;
        triedUsers.push({ name: userData.name, status: '✅ Family data found' });
        break; // Exit the loop once we find successful data

      } catch (error) {
        triedUsers.push({ name: userData.name, status: '❌ Connection error' });
        continue;
      }
    }

    // If no family data found for any user
    if (!familyData) {
      return res.status(404).json({
        success: false,
        message: '👨‍👩‍👧‍👦 Family data not found for this mobile number',
        search_details: {
          mobile_number: number,
          total_users_found: usersData.length,
          search_status: 'completed',
          tried_users: triedUsers
        },
        available_users: usersData.map(user => ({
          name: `👤 ${user.name}`,
          mobile: `📱 ${user.mobile}`,
          father_name: `👨 ${user.father_name || 'Not available'}`,
          address: `🏠 ${formatAddress(user.address)}`,
          circle: `📶 ${user.circle}`
        }))
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

    res.status(200).json(formattedResponse);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Internal server error',
      suggestion: 'Please try again with a valid mobile number'
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
